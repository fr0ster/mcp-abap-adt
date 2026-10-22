'use strict';
// Gives the RFC addon a RUNPATH of its own folder (Linux), so it finds the SDK
// beside it. No patchelf: nothing is moved, and the image keeps its size.
//
// - A binding that carries a RUNPATH (one compiled outside sap-rfc-lite's
//   prebuild script names its build's SDK) has that string overwritten; the new path is shorter, and the rest is
//   padded with NULs. The match must be a whole string of the table (a NUL on
//   both sides), found exactly once: a hit inside a longer string, or a second
//   hit, is refused rather than guessed at.
// - A binding that carries none (sap-rfc-lite's prebuilt ones, 0.3.0 and
//   later) gets one in place of its SONAME: the SONAME entry becomes the
//   RUNPATH entry, and its string the new path. The addon is loaded by path,
//   never by its SONAME, so nothing looks for that name. Refused when the
//   SONAME's string is shared with any other name of the image.
//
// The build cross-checks the result with readelf when it is available.
// ELF64 little-endian only: the one Linux the portable build makes (x64).

const SHT_DYNSYM = 11;
const SHT_DYNAMIC = 6;
const SHT_GNU_VERDEF = 0x6ffffffd;
const SHT_GNU_VERNEED = 0x6ffffffe;
const DT_NULL = 0n;
const DT_NEEDED = 1n;
const DT_SONAME = 14n;
const DT_RPATH = 15n;
const DT_RUNPATH = 29n;
const DT_AUXILIARY = 0x7ffffffdn;
const DT_FILTER = 0x7fffffffn;
// The dynamic entries whose value is an offset into the string table.
const STRING_TAGS = new Set([DT_NEEDED, DT_SONAME, DT_RPATH, DT_RUNPATH, DT_AUXILIARY, DT_FILTER]);

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

// The sections of an ELF64 little-endian image, and its dynamic entries with
// the file offset of each and, for the string-valued ones, of its string.
function readImage(bytes) {
  const ELF = bytes.length >= 64 && bytes.readUInt32BE(0) === 0x7f454c46;
  if (!ELF || bytes[4] !== 2 || bytes[5] !== 1) {
    throw new Error('the RFC addon is not a 64-bit little-endian ELF image');
  }
  const shoff = Number(bytes.readBigUInt64LE(0x28));
  const shentsize = bytes.readUInt16LE(0x3a);
  const shnum = bytes.readUInt16LE(0x3c);
  const sections = [];
  for (let i = 0; i < shnum; i++) {
    const at = shoff + i * shentsize;
    if (at + 64 > bytes.length) throw new Error('the RFC addon has a truncated section table');
    sections.push({
      type: bytes.readUInt32LE(at + 4),
      offset: Number(bytes.readBigUInt64LE(at + 0x18)),
      size: Number(bytes.readBigUInt64LE(at + 0x20)),
      link: bytes.readUInt32LE(at + 0x28),
      info: bytes.readUInt32LE(at + 0x2c),
    });
  }
  const section = (i) => {
    if (sections[i] === undefined) throw new Error('the RFC addon names a section it does not have');
    return sections[i];
  };
  const dynamics = [];
  for (const dynamic of sections) {
    if (dynamic.type !== SHT_DYNAMIC) continue;
    const strings = section(dynamic.link);
    for (let at = dynamic.offset; at + 16 <= dynamic.offset + dynamic.size; at += 16) {
      const tag = bytes.readBigInt64LE(at);
      if (tag === DT_NULL) break;
      const entry = { tag, at, strings: dynamic.link };
      if (STRING_TAGS.has(tag)) {
        entry.start = strings.offset + Number(bytes.readBigUInt64LE(at + 8));
        entry.end = bytes.indexOf(0, entry.start);
        if (entry.end < 0) throw new Error('the RFC addon has an unterminated dynamic string');
      }
      dynamics.push(entry);
    }
  }
  return { sections, section, dynamics };
}

// Every file offset at which a name of the image begins in the string table
// at `index`: the dynamic entries', the dynamic symbols' and the version
// records' — what a string overwritten in that table could also belong to.
function nameStarts(bytes, image, index) {
  const strings = image.section(index);
  const starts = [];
  for (const entry of image.dynamics) {
    if (entry.start !== undefined && entry.strings === index) starts.push(entry.start);
  }
  for (const s of image.sections) {
    if (s.link !== index) continue;
    if (s.type === SHT_DYNSYM) {
      for (let at = s.offset; at + 24 <= s.offset + s.size; at += 24) {
        starts.push(strings.offset + bytes.readUInt32LE(at));
      }
    } else if (s.type === SHT_GNU_VERNEED) {
      // Elf64_Verneed: vn_cnt @2, vn_file @4, vn_aux @8, vn_next @12;
      // Elf64_Vernaux: vna_name @8, vna_next @12. sh_info counts the records.
      let at = s.offset;
      for (let n = 0; n < s.info; n++) {
        starts.push(strings.offset + bytes.readUInt32LE(at + 4));
        let aux = at + bytes.readUInt32LE(at + 8);
        for (let k = 0; k < bytes.readUInt16LE(at + 2); k++) {
          starts.push(strings.offset + bytes.readUInt32LE(aux + 8));
          aux += bytes.readUInt32LE(aux + 12);
        }
        at += bytes.readUInt32LE(at + 12);
      }
    } else if (s.type === SHT_GNU_VERDEF) {
      // Elf64_Verdef: vd_cnt @6, vd_aux @12, vd_next @16; Elf64_Verdaux:
      // vda_name @0, vda_next @4.
      let at = s.offset;
      for (let n = 0; n < s.info; n++) {
        let aux = at + bytes.readUInt32LE(at + 12);
        for (let k = 0; k < bytes.readUInt16LE(at + 6); k++) {
          starts.push(strings.offset + bytes.readUInt32LE(aux));
          aux += bytes.readUInt32LE(aux + 4);
        }
        at += bytes.readUInt32LE(at + 16);
      }
    }
  }
  return starts;
}

// The RUNPATH (or, in an older image, the RPATH) the addon carries, read from
// its dynamic section: the string patchRunpath then replaces. A binding
// compiled outside the prebuild script names its build's SDK. `undefined` when it carries none, as
// sap-rfc-lite's prebuilt bindings (0.3.0 and later) do: addRunpath gives it one.
function readRunpath(bytes) {
  const found = readImage(bytes)
    .dynamics.filter((entry) => entry.tag === DT_RUNPATH || entry.tag === DT_RPATH)
    .map((entry) => bytes.toString('utf8', entry.start, entry.end));
  if (found.length > 1) throw new Error('the RFC addon carries more than one RUNPATH/RPATH');
  return found[0];
}

// A RUNPATH for an addon that carries none, in place of its SONAME (see the top).
function addRunpath(bytes, newPath) {
  const image = readImage(bytes);
  if (image.dynamics.some((entry) => entry.tag === DT_RUNPATH || entry.tag === DT_RPATH)) {
    throw new Error('the RFC addon already carries a RUNPATH/RPATH: it is rewritten, not added');
  }
  const sonames = image.dynamics.filter((entry) => entry.tag === DT_SONAME);
  if (sonames.length !== 1) {
    throw new Error(
      `the RFC addon carries no RUNPATH and ${sonames.length === 0 ? 'no SONAME' : 'more than one SONAME'} to put one in place of: it could not find the SDK beside it`,
    );
  }
  const [soname] = sonames;
  const name = bytes.toString('utf8', soname.start, soname.end);
  if (Buffer.byteLength(newPath) > soname.end - soname.start) {
    throw new Error(`the new RUNPATH "${newPath}" is longer than the SONAME "${name}" it replaces`);
  }
  // Any other name beginning inside the SONAME's string, or at its start,
  // would be overwritten with it.
  const others = nameStarts(bytes, image, soname.strings).filter(
    (start) => start >= soname.start && start <= soname.end,
  );
  if (others.length !== 1) {
    throw new Error(`the SONAME "${name}" of the RFC addon shares its string with another name: no RUNPATH is added`);
  }
  const out = Buffer.from(bytes);
  out.writeBigInt64LE(DT_RUNPATH, soname.at);
  const replacement = Buffer.from(newPath);
  replacement.copy(out, soname.start);
  out.fill(0, soname.start + replacement.length, soname.end);
  return out;
}

module.exports = { patchRunpath, readRunpath, addRunpath };
