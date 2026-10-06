#!/usr/bin/env node
// A macOS crash report (.ips) reduced to where the process died: the process,
// its parent, the signal and the faulting thread's frames. CI prints this when
// the test step dies on a signal, so the log says which process crashed and in
// what, without downloading the artifact.
//
// Usage: node scripts/ci/ips-summary.cjs <report.ips>...
const fs = require('node:fs');

function summarize(text) {
  try {
    // An .ips file is a one-line JSON header followed by the JSON report.
    const body = JSON.parse(text.slice(text.indexOf('\n') + 1));
    const images = body.usedImages || [];
    const exc = body.exception || {};
    const index = body.faultingThread ?? 0;
    const thread = (body.threads || [])[index] || {};
    const frames = (thread.frames || []).slice(0, 40).map((f) => {
      const image = (images[f.imageIndex] || {}).name || '?';
      const where = f.symbol
        ? `${f.symbol} + ${f.symbolLocation ?? 0}`
        : `0x${(f.imageOffset ?? 0).toString(16)}`;
      return `  ${image} ${where}`;
    });
    return [
      `${body.procName || '?'} [${body.pid ?? '?'}], parent ${body.parentProc || '?'}`,
      [exc.type, exc.signal, exc.subtype].filter(Boolean).join(' '),
      `thread ${index}${thread.name ? ` (${thread.name})` : ''}:`,
      ...frames,
    ].join('\n');
  } catch (e) {
    return `unreadable crash report: ${e.message}`;
  }
}

if (require.main === module) {
  for (const file of process.argv.slice(2)) {
    console.log(`== ${file}`);
    console.log(summarize(fs.readFileSync(file, 'utf8')));
  }
}

module.exports = { summarize };
