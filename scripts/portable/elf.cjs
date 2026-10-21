'use strict';
// Rewrites the RFC addon's RUNPATH in place (Linux), so it finds the SDK in its
// own folder. No patchelf: the new path is shorter, so the old string is
// overwritten and the rest padded with NULs — the string table keeps its size.
//
// The match must be a whole string of the table (a NUL on both sides), found
// exactly once: a hit inside a longer string, or a second hit, is refused
// rather than guessed at. The build cross-checks the result with readelf when
// it is available (a linker may tail-merge another string into this one).

function patchRunpath(bytes, oldPath, newPath) {
  if (Buffer.byteLength(newPath) > Buffer.byteLength(oldPath)) {
    throw new Error(`the new RUNPATH "${newPath}" is longer than "${oldPath}"`);
  }
  const needle = Buffer.from(`\0${oldPath}\0`);
  const at = bytes.indexOf(needle);
  if (at < 0) throw new Error(`RUNPATH "${oldPath}" not found in the RFC addon`);
  if (bytes.indexOf(needle, at + 1) >= 0) {
    throw new Error(`RUNPATH "${oldPath}" occurs more than once in the RFC addon`);
  }
  const out = Buffer.from(bytes);
  const start = at + 1;
  const replacement = Buffer.from(newPath);
  replacement.copy(out, start);
  out.fill(0, start + replacement.length, start + Buffer.byteLength(oldPath));
  return out;
}

// The RUNPATH (or, in an older image, the RPATH) the addon carries, read from
// its dynamic section: the string patchRunpath then replaces. A binding built
// here names this machine's SDK; a prebuilt one (sap-rfc-lite 0.2.3 and later)
// names whatever its publisher's SDK was — so it is read, never assumed.
// ELF64 little-endian only: the one Linux the portable build makes (x64).
const SHT_DYNAMIC = 6;
const DT_NULL = 0n;
const DT_RPATH = 15n;
const DT_RUNPATH = 29n;

function readRunpath(bytes) {
  const ELF = bytes.length >= 64 && bytes.readUInt32BE(0) === 0x7f454c46;
  if (!ELF || bytes[4] !== 2 || bytes[5] !== 1) {
    throw new Error('the RFC addon is not a 64-bit little-endian ELF image');
  }
  const shoff = Number(bytes.readBigUInt64LE(0x28));
  const shentsize = bytes.readUInt16LE(0x3a);
  const shnum = bytes.readUInt16LE(0x3c);
  const section = (i) => {
    const at = shoff + i * shentsize;
    if (at + 64 > bytes.length) throw new Error('the RFC addon has a truncated section table');
    return {
      type: bytes.readUInt32LE(at + 4),
      offset: Number(bytes.readBigUInt64LE(at + 0x18)),
      size: Number(bytes.readBigUInt64LE(at + 0x20)),
      link: bytes.readUInt32LE(at + 0x28),
    };
  };
  const found = [];
  for (let i = 0; i < shnum; i++) {
    const dynamic = section(i);
    if (dynamic.type !== SHT_DYNAMIC) continue;
    const strings = section(dynamic.link);
    for (let at = dynamic.offset; at + 16 <= dynamic.offset + dynamic.size; at += 16) {
      const tag = bytes.readBigInt64LE(at);
      if (tag === DT_NULL) break;
      if (tag !== DT_RUNPATH && tag !== DT_RPATH) continue;
      const start = strings.offset + Number(bytes.readBigUInt64LE(at + 8));
      const end = bytes.indexOf(0, start);
      if (end < 0) throw new Error('the RFC addon has an unterminated RUNPATH');
      found.push(bytes.toString('utf8', start, end));
    }
  }
  if (found.length === 0) {
    throw new Error('the RFC addon carries no RUNPATH: it could not find the SDK beside it');
  }
  if (found.length > 1) throw new Error('the RFC addon carries more than one RUNPATH/RPATH');
  return found[0];
}

module.exports = { patchRunpath, readRunpath };
