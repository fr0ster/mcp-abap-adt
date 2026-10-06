/**
 * scripts/ci/ips-summary.cjs: the macOS crash report (.ips) of a process that
 * died in CI, reduced to what says where it died — the process, its parent,
 * the signal and the faulting thread's frames.
 */
const { summarize } = require('../../../../scripts/ci/ips-summary.cjs');

const report = (body: Record<string, unknown>) =>
  `${JSON.stringify({ app_name: 'node', bug_type: '309' })}\n${JSON.stringify(body, null, 2)}`;

const crash = {
  procName: 'node',
  pid: 2623,
  parentProc: 'bash',
  exception: { type: 'EXC_BAD_ACCESS', signal: 'SIGSEGV', subtype: 'KERN_INVALID_ADDRESS at 0x8' },
  faultingThread: 1,
  usedImages: [{ name: 'node' }, { name: 'libsystem_kernel.dylib' }],
  threads: [
    { frames: [{ imageIndex: 1, symbol: '__psynch_cvwait', symbolLocation: 8 }] },
    {
      name: 'V8 worker',
      frames: [
        { imageIndex: 0, symbol: 'v8::internal::Heap::Scavenge', symbolLocation: 120 },
        { imageIndex: 0, imageOffset: 4096 },
      ],
    },
  ],
};

describe('ips-summary', () => {
  it('names the process, its parent and the signal', () => {
    const text = summarize(report(crash));
    expect(text).toContain('node [2623], parent bash');
    expect(text).toContain('EXC_BAD_ACCESS SIGSEGV KERN_INVALID_ADDRESS at 0x8');
  });

  it('lists the faulting thread, not the first one', () => {
    const text = summarize(report(crash));
    expect(text).toContain('thread 1 (V8 worker)');
    expect(text).toContain('node v8::internal::Heap::Scavenge + 120');
    expect(text).toContain('node 0x1000');
    expect(text).not.toContain('__psynch_cvwait');
  });

  it('says what it could not read instead of throwing', () => {
    expect(summarize('not a crash report')).toMatch(/^unreadable crash report/);
  });
});
