import { expositionHelp, toHandlerSets } from '../../../lib/config/exposition';
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
    expect(names({ includeDebug: true })).toContain('DebugStartListener');
  });

  describe('--exposition', () => {
    it('accepts debug beside readonly', () => {
      expect(toHandlerSets(['readonly', 'debug'])).toEqual([
        'readonly',
        'debug',
      ]);
    });

    it('lists debug in the help text', () => {
      expect(expositionHelp()).toMatch(/debug:\s+the debugger tools; opt-in/);
    });
  });
});
