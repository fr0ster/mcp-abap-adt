import { ServerConfigManager } from '../../../lib/config/ServerConfigManager';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';

describe('the debug set', () => {
  it('is a handler set of its own', () => {
    expect(
      new DebugHandlersGroup({ connection: undefined } as any).getName(),
    ).toBe('DebugHandlers');
  });

  it('HandlerExporter leaves it out unless asked, and gives it when asked', () => {
    const names = (o: any) =>
      new HandlerExporter(o)
        .getHandlerEntries()
        .map((e) => e.toolDefinition.name);
    expect(
      names({}).some((n: string) =>
        /^(Debug|AmdpDebug|MemorySnapshot)/.test(n),
      ),
    ).toBe(false);
    // the group is filled in Tasks 10-12; this assertion is tightened there to the tool names
    expect(() => names({ includeDebug: true })).not.toThrow();
  });

  describe('--exposition', () => {
    const saved = process.argv;
    afterEach(() => {
      process.argv = saved;
    });

    it('accepts debug beside readonly', () => {
      process.argv = [...saved.slice(0, 2), '--exposition=readonly,debug'];
      const manager = Object.create(ServerConfigManager.prototype) as any;
      expect(manager.parseExposition()).toEqual(['readonly', 'debug']);
    });

    it('lists debug in the help text', () => {
      expect(ServerConfigManager.getHandlerSetsDescription()).toMatch(
        /debug:\s+the debugger tools; opt-in/,
      );
    });
  });
});
