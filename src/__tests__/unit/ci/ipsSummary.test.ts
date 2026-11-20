/**
 * scripts/ci/ips-summary.cjs: the macOS crash report (.ips) of a process that
 * died in CI, reduced to what says where it died — the process, its parent,
 * the signal and the faulting thread's frames.
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

// From the repository root: the script is not part of the node:test build.
const { summarize } = require(
  path.join(repositoryRoot(__dirname), 'scripts', 'ci', 'ips-summary.cjs'),
);

const report = (body: Record<string, unknown>) =>
  `${JSON.stringify({ app_name: 'node', bug_type: '309' })}\n${JSON.stringify(body, null, 2)}`;

const crash = {
  procName: 'node',
  pid: 2623,
  parentProc: 'bash',
  exception: {
    type: 'EXC_BAD_ACCESS',
    signal: 'SIGSEGV',
    subtype: 'KERN_INVALID_ADDRESS at 0x8',
  },
  faultingThread: 1,
  usedImages: [{ name: 'node' }, { name: 'libsystem_kernel.dylib' }],
  threads: [
    {
      frames: [{ imageIndex: 1, symbol: '__psynch_cvwait', symbolLocation: 8 }],
    },
    {
      name: 'V8 worker',
      frames: [
        {
          imageIndex: 0,
          symbol: 'v8::internal::Heap::Scavenge',
          symbolLocation: 120,
        },
        { imageIndex: 0, imageOffset: 4096 },
      ],
    },
  ],
};

describe('ips-summary', () => {
  it('names the process, its parent and the signal', () => {
    const text = summarize(report(crash));
    assert.ok(text.includes('node [2623], parent bash'));
    assert.ok(
      text.includes('EXC_BAD_ACCESS SIGSEGV KERN_INVALID_ADDRESS at 0x8'),
    );
  });

  it('lists the faulting thread, not the first one', () => {
    const text = summarize(report(crash));
    assert.ok(text.includes('thread 1 (V8 worker)'));
    assert.ok(text.includes('node v8::internal::Heap::Scavenge + 120'));
    assert.ok(text.includes('node 0x1000'));
    assert.ok(!text.includes('__psynch_cvwait'));
  });

  it('cuts a templated C++ symbol to one readable line', () => {
    const long = `v8::internal::LookupIterator::LookupIterator(${'v8::internal::Smi, '.repeat(40)})`;
    const text = summarize(
      report({
        ...crash,
        faultingThread: 0,
        threads: [
          { frames: [{ imageIndex: 0, symbol: long, symbolLocation: 376 }] },
        ],
      }),
    );
    const frame = text
      .split('\n')
      .find((l: string) => l.includes('LookupIterator'));
    assert.ok(frame.length <= 200);
    assert.ok(frame.includes('v8::internal::LookupIterator::LookupIterator('));
    assert.match(frame, /… \+ 376$/);
  });

  it('says what it could not read instead of throwing', () => {
    assert.match(summarize('not a crash report'), /^unreadable crash report/);
  });
});
