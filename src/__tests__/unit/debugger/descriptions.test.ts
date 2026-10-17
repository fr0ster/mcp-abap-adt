import { compactDebugEntries } from '../../../lib/compact/debug/group';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';

/** A tool's own text and every parameter description, at any depth. */
const textsOf = (definition: {
  description: string;
  inputSchema: unknown;
}): string[] => {
  const found: string[] = [definition.description];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'description' && typeof value === 'string') found.push(value);
      else walk(value);
    }
  };
  walk(definition.inputSchema);
  return found;
};

const coreDebugTools = () =>
  new DebugHandlersGroup({} as never).getHandlers().map(
    (e) =>
      e.toolDefinition as {
        name: string;
        description: string;
        inputSchema: unknown;
      },
  );

const START_TOOLS = ['DebugStartListener', 'DebugTakeOverListener'];

describe('the debugger descriptions', () => {
  it('no breakpoint description says every kind takes a condition', () => {
    for (const tool of [
      ...coreDebugTools(),
      ...compactDebugEntries().map(
        (e) =>
          e.toolDefinition as {
            name: string;
            description: string;
            inputSchema: unknown;
          },
      ),
    ])
      for (const text of textsOf(tool))
        expect({ tool: tool.name, text }).not.toEqual({
          tool: tool.name,
          text: expect.stringMatching(
            /each with an optional condition|with an optional condition/,
          ),
        });
  });

  it('the breakpoint descriptions say a line breakpoint may carry a condition', () => {
    const set = coreDebugTools().find((t) => t.name === 'DebugSetBreakpoints')!;
    expect(textsOf(set).join('\n')).toMatch(
      /a line breakpoint may carry a condition/,
    );
  });

  it('the set is described as shared by the key and replaced as a whole', () => {
    for (const name of ['DebugSetBreakpoints', ...START_TOOLS]) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      expect(tool.description).toMatch(
        /shared by every IDE of the same SAP user \(in user mode, debugging the same request user; in terminal mode, whatever its ids\)/,
      );
      expect(tool.description).toMatch(/replaces that set as a whole/);
    }
  });

  it('no new parameter carries a default the boundary would fill in', () => {
    for (const name of [...START_TOOLS, 'DebugSetSettings']) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      const props = (
        tool.inputSchema as {
          properties: Record<
            string,
            {
              default?: unknown;
              properties?: Record<string, { default?: unknown }>;
            }
          >;
        }
      ).properties;
      for (const key of [
        'request_user',
        'debugging_mode',
        'settings',
        'system_debugging',
      ])
        if (props[key]) {
          expect({ key, default: props[key].default }).toEqual({
            key,
            default: undefined,
          });
          for (const inner of Object.values(props[key].properties ?? {}))
            expect(inner.default).toBeUndefined();
        }
    }
  });

  // The AMDP session takes no mode and no request user: it is the connected user's.
  it('the AMDP tools name no request user and no mode', () => {
    const amdp = coreDebugTools().filter((t) => t.name.startsWith('Amdp'));
    expect(amdp.length).toBeGreaterThan(0);
    for (const tool of amdp)
      for (const text of textsOf(tool))
        expect({ tool: tool.name, text }).not.toEqual({
          tool: tool.name,
          text: expect.stringMatching(
            /request user|request_user|user mode|terminal mode|debugging mode/i,
          ),
        });
    for (const name of ['AmdpDebugStart', 'AmdpDebugSetBreakpoints'])
      expect(amdp.find((t) => t.name === name)!.description).toMatch(
        /every request of the connected SAP user/,
      );
  });

  it('the compact tools scope the request user to abap and give amdp the connected user', () => {
    const description = (name: string) =>
      compactDebugEntries().find((e) => e.toolDefinition.name === name)!
        .toolDefinition.description as string;
    expect(description('HandlerDebugBreakpoints')).toMatch(
      /In user mode the breakpoints catch every request of the request user/,
    );
    expect(description('HandlerDebugSession')).toMatch(
      /kind amdp: start opens an AMDP session for the connected SAP user/,
    );
  });

  // The user's decision (2026-10-11): a start without breakpoints is refused, so a
  // model that forgets them learns it at once instead of waiting on a listener
  // that can catch nothing of its own.
  it('both starts require at least one breakpoint, and say so', () => {
    for (const name of START_TOOLS) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      const schema = tool.inputSchema as {
        required?: string[];
        properties: Record<string, { minItems?: number }>;
      };
      expect({ name, required: schema.required }).toEqual({
        name,
        required: expect.arrayContaining(['breakpoints']),
      });
      expect(schema.properties.breakpoints.minItems).toBe(1);
      expect(tool.description).toMatch(/at least one breakpoint/);
    }
  });
});
