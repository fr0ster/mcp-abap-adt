/**
 * The system kind is required, never guessed: a `HandlerExporter` whose
 * `systemType` option and `SAP_SYSTEM_TYPE` state none — or a value other
 * than `onprem`, `cloud` or `legacy` — is refused at construction, as
 * `EmbeddableMcpServer` is, before any handler is handed out.
 */

import {
  ServerRefusal,
  SYSTEM_TYPE_REQUIRED_WORDS,
} from '../../lib/auth/serverRefusal';
import {
  createDefaultHandlerExporter,
  HandlerExporter,
} from '../../lib/handlers/HandlerExporter';

const previous = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

function construct(build: () => unknown): unknown {
  try {
    build();
  } catch (error) {
    return error;
  }
  return undefined;
}

it.each([
  ['neither the option nor SAP_SYSTEM_TYPE', undefined],
  ['a blank SAP_SYSTEM_TYPE', ' '],
  ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
])('%s: refused at construction', (_what, env) => {
  if (env === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = env;
  for (const build of [
    () => new HandlerExporter(),
    () => new HandlerExporter({ systemContextResolver: null }),
    () => createDefaultHandlerExporter(),
  ]) {
    const thrown = construct(build);
    expect(thrown).toBeInstanceOf(ServerRefusal);
    expect((thrown as ServerRefusal).serverRefusal).toBe(
      'system_type_required',
    );
    expect((thrown as Error).message).toBe(SYSTEM_TYPE_REQUIRED_WORDS);
  }
});

it.each(['onprem', 'cloud', 'legacy'] as const)(
  'the option %s states it, SAP_SYSTEM_TYPE unset',
  (systemType) => {
    delete process.env.SAP_SYSTEM_TYPE;
    expect(
      construct(() => new HandlerExporter({ systemType })),
    ).toBeUndefined();
    expect(
      construct(() => createDefaultHandlerExporter(undefined, systemType)),
    ).toBeUndefined();
  },
);

it.each(['onprem', 'cloud', 'legacy'])(
  'SAP_SYSTEM_TYPE=%s states it without the option',
  (env) => {
    process.env.SAP_SYSTEM_TYPE = env;
    expect(construct(() => new HandlerExporter())).toBeUndefined();
  },
);
