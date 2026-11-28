import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import { fullReadOnlyToolSet, fullToolSet } from '../../../lib/toolSet';

describe('the debug set', () => {
  it('is a handler set of its own', () => {
    assert.equal(
      new DebugHandlersGroup({ connection: undefined } as any).getName(),
      'DebugHandlers',
    );
  });

  it('HandlerExporter leaves it out (its options have no includeDebug), the memory snapshot reads of the readonly group aside', () => {
    const names = new HandlerExporter({ systemType: 'onprem' })
      .getHandlerEntries()
      .map((e) => e.toolDefinition.name);
    assert.equal(
      names.some(
        (n: string) => n.startsWith('Debug') || n.startsWith('AmdpDebug'),
      ),
      false,
    );
    assert.ok(names.includes('MemorySnapshotList'));
  });

  // The binary fixes its set: always in core, never in core-ro.
  describe('the binaries', () => {
    const groupsOf = (set: typeof fullToolSet) =>
      set
        .groups({ connection: undefined } as any, 'stdio', { dataTools: false })
        .map((g) => g.getName());

    it('mcp-abap-adt (and -http, -sse) serves it always', () => {
      assert.ok(groupsOf(fullToolSet).includes('DebugHandlers'));
    });

    it('mcp-abap-adt-ro (and -http-ro, -sse-ro) never', () => {
      assert.ok(!groupsOf(fullReadOnlyToolSet).includes('DebugHandlers'));
    });

    it('the help names it, with what a breakpoint catches', () => {
      assert.match(
        fullToolSet.toolsHelp('stdio'),
        /debug: the debugger tools; a breakpoint or a listener catches every request of the connected SAP user/,
      );
      assert.ok(!fullReadOnlyToolSet.toolsHelp('stdio').includes('debug:'));
    });
  });
});
