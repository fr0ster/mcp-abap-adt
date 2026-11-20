/**
 * `processEdges()`, the program's edges: the shutdown listens on the real
 * process through `processLike`, which hands the process's `on`, `stdin` and
 * `stdout` — never `process` itself (D27: production code uses `process`
 * only for a named member).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { processEdges } from '../../../lib/config/startup';

describe('processEdges', () => {
  it('a listener registered through processLike is on the real process (warning)', () => {
    const { processLike } = processEdges();
    const listener = () => undefined;
    const before = process.listeners('warning').length;
    processLike.on('warning', listener);
    try {
      const after = process.listeners('warning');
      assert.equal(after.length, before + 1);
      assert.ok(after.includes(listener));
    } finally {
      process.removeListener('warning', listener);
    }
    assert.equal(process.listeners('warning').length, before);
  });

  it("processLike's streams are the process's own", () => {
    const { processLike } = processEdges();
    assert.equal(processLike.stdin, process.stdin);
    assert.equal(processLike.stdout, process.stdout);
  });

  it('processLike is not process itself', () => {
    assert.notEqual(processEdges().processLike, process);
  });
});
