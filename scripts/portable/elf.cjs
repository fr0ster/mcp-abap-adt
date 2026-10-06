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

module.exports = { patchRunpath };
