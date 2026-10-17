import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import { fullReadOnlyToolSet, fullToolSet } from '../../../lib/toolSet';

describe('the debug set', () => {
  it('is a handler set of its own', () => {
    expect(
      new DebugHandlersGroup({ connection: undefined } as any).getName(),
    ).toBe('DebugHandlers');
  });

  it('HandlerExporter leaves it out unless asked, and gives it when asked', () => {
    const names = (o: any) =>
      new HandlerExporter({ systemType: 'onprem', ...o })
        .getHandlerEntries()
        .map((e) => e.toolDefinition.name);
    expect(
      names({}).some((n: string) =>
        /^(Debug|AmdpDebug|MemorySnapshot)/.test(n),
      ),
    ).toBe(false);
    expect(names({ includeDebug: true })).toContain('DebugStartListener');
  });

  // The binary fixes its set: always in core, never in core-ro.
  describe('the binaries', () => {
    const groupsOf = (set: typeof fullToolSet) =>
      set
        .groups({ connection: undefined } as any, 'stdio')
        .map((g) => g.getName());

    it('mcp-abap-adt (and -http, -sse) serves it always', () => {
      expect(groupsOf(fullToolSet)).toContain('DebugHandlers');
    });

    it('mcp-abap-adt-ro (and -http-ro, -sse-ro) never', () => {
      expect(groupsOf(fullReadOnlyToolSet)).not.toContain('DebugHandlers');
    });

    it('the help names it, with what a breakpoint catches', () => {
      expect(fullToolSet.toolsHelp('stdio')).toMatch(
        /debug: the debugger tools; a breakpoint or a listener catches every request of the connected SAP user/,
      );
      expect(fullReadOnlyToolSet.toolsHelp('stdio')).not.toContain('debug:');
    });
  });
});
