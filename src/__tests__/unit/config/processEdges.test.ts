/**
 * `processEdges()`, the program's edges: the shutdown listens on the real
 * process through `processLike`, which hands the process's `on`, `stdin` and
 * `stdout` — never `process` itself (D27: production code uses `process`
 * only for a named member).
 */
import { processEdges } from '../../../lib/config/startup';

describe('processEdges', () => {
  it('a listener registered through processLike is on the real process (warning)', () => {
    const { processLike } = processEdges();
    const listener = () => undefined;
    const before = process.listeners('warning').length;
    processLike.on('warning', listener);
    try {
      const after = process.listeners('warning');
      expect(after).toHaveLength(before + 1);
      expect(after).toContain(listener);
    } finally {
      process.removeListener('warning', listener);
    }
    expect(process.listeners('warning')).toHaveLength(before);
  });

  it("processLike's streams are the process's own", () => {
    const { processLike } = processEdges();
    expect(processLike.stdin).toBe(process.stdin);
    expect(processLike.stdout).toBe(process.stdout);
  });

  it('processLike is not process itself', () => {
    expect(processEdges().processLike).not.toBe(process);
  });
});
