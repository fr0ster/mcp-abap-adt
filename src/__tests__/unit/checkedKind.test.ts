/**
 * The kind a call is checked on before dispatch (`systemKindOf` with the
 * kind the path states) is the kind
 * it is dispatched on, for every combination of a stated kind, a factory
 * record, a declared kind and `SAP_SYSTEM_TYPE` — a conflicting one
 * included — on the server (the environment its fallback) and on a plain
 * registration or `HandlerExporter` (the environment not read). Reading
 * the kind records nothing, and a statement of no kind erases no declared
 * one.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  createAbapConnection,
  systemKindOf,
} from '../../lib/connectionFactory';
import {
  declaredSystemKindOf,
  declareSystemKind,
  stateSystemKind,
} from '../../lib/systemKind';

type Kind = 'onprem' | 'cloud';
const KINDS = [undefined, 'onprem', 'cloud'] as const;

const saved = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

/** A connection with the factory's record of `record`, or none. */
function connectionWith(record: Kind | undefined): object {
  if (record === undefined) return {};
  return createAbapConnection(
    { url: 'https://system.example.invalid', client: '100', authType: 'basic' },
    new BasicAuthProvider('KIND_USER', 'kind-password'),
    null,
    undefined,
    undefined,
    record,
  );
}

const COMBINATIONS = KINDS.flatMap((stated) =>
  KINDS.flatMap((record) =>
    KINDS.flatMap((declared) =>
      KINDS.map((env) => ({ stated, record, declared, env })),
    ),
  ),
);

describe.each(COMBINATIONS)(
  'stated $stated, record $record, declared $declared, env $env',
  ({ stated, record, declared, env }) => {
    beforeEach(() => {
      if (env === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = env;
    });

    it('the server: checked as dispatched', () => {
      const connection = connectionWith(record);
      if (declared !== undefined) declareSystemKind(connection, declared);
      const checked = systemKindOf(connection, process.env, stated);
      // Dispatch: the server declares its kind, the call reads the kind.
      declareSystemKind(connection, stated);
      expect(checked).toBe(systemKindOf(connection));
    });

    it('a plain registration and the exporter: checked as dispatched, the environment unread', () => {
      const connection = connectionWith(record);
      if (declared !== undefined) declareSystemKind(connection, declared);
      const checked = systemKindOf(connection, {}, stated);
      // Dispatch: the group states its kind, the call reads the kind.
      stateSystemKind(connection, stated);
      expect(checked).toBe(systemKindOf(connection));
      if (
        record === undefined &&
        stated === undefined &&
        declared === undefined
      ) {
        expect(checked).toBeUndefined();
      }
    });

    it('checking records nothing; stating none erases no declared kind', () => {
      const connection = connectionWith(record);
      if (declared !== undefined) declareSystemKind(connection, declared);
      systemKindOf(connection, process.env, stated);
      expect(declaredSystemKindOf(connection)).toBe(declared);
      stateSystemKind(connection, undefined);
      expect(declaredSystemKindOf(connection)).toBe(declared ?? 'none');
    });
  },
);
