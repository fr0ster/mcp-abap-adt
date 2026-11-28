/**
 * Where a read belongs: in the read-only set. A tool marked `[read-only]`
 * changes nothing in the system (`descriptionsFunctional.test.ts` holds the
 * marker to that), so every one the core set serves, core-ro serves too, on
 * every transport and system type — but for the tools that work only inside
 * a state a write tool opens:
 *
 * - a debug session's reads and waits: they take the `state_handle` a
 *   debugger start answers, and no read-only set starts a debugger;
 * - the debugger batch: its calls replay the steps of a stopped debuggee;
 * - the memory snapshot reads (`MemorySnapshotList`, `…Get`, `…Delta`): the
 *   debugger's, and the debugger is served by the write sets alone.
 *
 * And the other way round: every tool core-ro serves carries `[read-only]`.
 *
 * Run: npm test -- src/__tests__/unit/toolSet/readOnlyPlacement.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type ServedTool,
  SYSTEM_TYPES,
  servedCatalog,
  setOf,
  TRANSPORTS,
} from '../descriptions/catalog';

/** The debugger batch, which replays the steps of a stopped debuggee. */
const DEBUGGER_BATCH: ReadonlySet<string> = new Set([
  'DebugBatchBegin',
  'DebugBatchAnswers',
]);

/** The memory snapshot reads: the debugger's. */
const SNAPSHOT_READS: ReadonlySet<string> = new Set([
  'MemorySnapshotList',
  'MemorySnapshotGet',
  'MemorySnapshotDelta',
]);

/** Whether `tool` is the debugger's: a debug session's, or a memory snapshot's. */
function insideDebugSession(tool: ServedTool): boolean {
  if (DEBUGGER_BATCH.has(tool.name) || SNAPSHOT_READS.has(tool.name)) {
    return true;
  }
  return (
    (tool.name.startsWith('Debug') || tool.name.startsWith('AmdpDebug')) &&
    tool.parameters.includes('state_handle')
  );
}

const isReadOnly = (tool: ServedTool) =>
  tool.description.startsWith('[read-only]');

describe('every read is in the read-only set', () => {
  for (const transport of TRANSPORTS) {
    for (const systemType of SYSTEM_TYPES) {
      it(`core-ro serves every read core serves (${transport}, ${systemType})`, async () => {
        const core = await servedCatalog(setOf('core'), transport, systemType);
        const ro = new Set(
          (await servedCatalog(setOf('core-ro'), transport, systemType)).map(
            (tool) => tool.name,
          ),
        );
        const missing = core
          .filter((tool) => isReadOnly(tool) && !insideDebugSession(tool))
          .map((tool) => tool.name)
          .filter((name) => !ro.has(name));
        assert.deepEqual(missing, []);
      });

      it(`every tool core-ro serves is a read (${transport}, ${systemType})`, async () => {
        const ro = await servedCatalog(setOf('core-ro'), transport, systemType);
        assert.deepEqual(
          ro.filter((tool) => !isReadOnly(tool)).map((tool) => tool.name),
          [],
        );
      });
    }
  }

  it('the local includes of a class are read on core-ro', async () => {
    const ro = new Set(
      (await servedCatalog(setOf('core-ro'))).map((tool) => tool.name),
    );
    for (const name of [
      'GetLocalTypes',
      'GetLocalDefinitions',
      'GetLocalMacros',
      'GetLocalTestClass',
    ]) {
      assert.deepEqual([name, ro.has(name)], [name, true]);
    }
  });

  it('GetClass points at the reads of the local includes, on core and core-ro', async () => {
    for (const kind of ['core', 'core-ro'] as const) {
      const getClass = (await servedCatalog(setOf(kind))).find(
        (tool) => tool.name === 'GetClass',
      );
      assert.ok(
        getClass?.description.includes(
          'The local definitions, local types and implementations, local macros and local test classes of the class have read tools of their own.',
        ),
        `${kind}: ${getClass?.description}`,
      );
    }
  });
});
