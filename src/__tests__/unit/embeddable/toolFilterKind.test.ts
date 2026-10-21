/**
 * The tool filter (`available_in`) never guesses a kind: with a kind stated
 * (the server's `systemType`, else `SAP_SYSTEM_TYPE`) a tool is listed only
 * where it is available; with none stated — stdio's inspection-only mode, or
 * an embedder's own transport host that states none — nothing is filtered:
 * every tool of the set is listed (there is no `cloud` default), and a call
 * that would reach a system is refused `system_type_required`.
 */

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';

const previous = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const tool = (name: string, available_in?: SapEnvironment[]) => ({
  toolDefinition: {
    name,
    description: name,
    inputSchema: { type: 'object', properties: {} },
    ...(available_in !== undefined ? { available_in } : {}),
  },
  handler: async () => ({ content: [] }),
});

const group = {
  getName: () => 'kinds',
  getHandlers: () => [
    tool('Everywhere'),
    tool('OnPremOnly', ['onprem', 'legacy']),
    tool('CloudOnly', ['cloud']),
  ],
};

class Server extends BaseMcpServer {
  constructor(systemType?: SapEnvironment) {
    super({
      name: 'kinds',
      ...(systemType !== undefined ? { systemType } : {}),
    });
    this.registerHandlers(new CompositeHandlersRegistry([group as never]));
  }
  names(): string[] {
    const tools = (this as unknown as { _registeredTools: object })
      ._registeredTools;
    return Object.keys(tools).sort();
  }
}

it.each([
  ['no SAP_SYSTEM_TYPE', undefined],
  ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
])('%s and no option: every tool is listed, none filtered', (_what, env) => {
  if (env === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = env;
  expect(new Server().names()).toEqual([
    'CloudOnly',
    'Everywhere',
    'OnPremOnly',
  ]);
});

it.each([
  ['cloud', ['CloudOnly', 'Everywhere']],
  ['onprem', ['Everywhere', 'OnPremOnly']],
  ['legacy', ['Everywhere', 'OnPremOnly']],
] as const)('SAP_SYSTEM_TYPE=%s: only its tools', (env, listed) => {
  process.env.SAP_SYSTEM_TYPE = env;
  expect(new Server().names()).toEqual(listed);
});

it('the option wins over SAP_SYSTEM_TYPE', () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  expect(new Server('onprem').names()).toEqual(['Everywhere', 'OnPremOnly']);
});
