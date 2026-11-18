// The node:test reporter of `tools/test-parity.mjs` (spec §8, "Counts"):
// writes one JSON document — every test of the run in the order it ran,
// each with its full title (ancestors and title joined by ` > `) and its
// status (`passed`, `failed`, `skipped`), and their count — the shape
// `test-parity.mjs record` writes from Jest's `--json` result.
//
//   node --test --test-reporter=./tools/test-parity-reporter.mjs
//     --test-reporter-destination=<file> <file>
//
// A suite (`describe`) is not a test; its title is its children's
// ancestor. node:test reports a test when it ends, children before their
// suite, so each level's ended tests wait for their suite's own report to
// learn its title. A file-level failure (the file does not load) is
// reported as a failed test with the file's name, so it cannot pass as an
// empty file.

/** The status of a reported test, as the record names it. */
function statusOf(type, data) {
  if (data.skip !== undefined || data.todo !== undefined) return 'skipped';
  return type === 'test:pass' ? 'passed' : 'failed';
}

export default async function* parityReporter(source) {
  // The ended tests waiting for their suite, per nesting level.
  const waiting = [];
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const { data } = event;
    const level = data.nesting;
    const children = waiting[level + 1] ?? [];
    waiting.length = level + 1;
    if (data.details?.type === 'suite') {
      const prefixed = children.map((child) => ({
        title: `${data.name} > ${child.title}`,
        status: child.status,
      }));
      // A suite that failed outside its tests (a hook) is a failure too.
      if (event.type === 'test:fail' && children.length === 0) {
        prefixed.push({ title: data.name, status: 'failed' });
      }
      waiting[level] = [...(waiting[level] ?? []), ...prefixed];
    } else {
      waiting[level] = [
        ...(waiting[level] ?? []),
        { title: data.name, status: statusOf(event.type, data) },
      ];
    }
  }
  const tests = waiting[0] ?? [];
  yield `${JSON.stringify({ count: tests.length, tests }, null, 2)}\n`;
}
