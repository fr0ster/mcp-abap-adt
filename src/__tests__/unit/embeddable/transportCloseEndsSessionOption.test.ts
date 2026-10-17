/**
 * `EmbeddableMcpServer` hands `transportCloseEndsSession` to the base: by
 * default its transport's close is the session's end (the hook is wired);
 * `false` — a host with a transport per request — wires nothing.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const connection = {} as unknown as IAbapConnection;

function onCloseOf(server: EmbeddableMcpServer): unknown {
  return (server as unknown as { server: { onclose?: unknown } }).server
    .onclose;
}

it('wires the session-end hook by default', () => {
  const server = new EmbeddableMcpServer({
    connection,
    exposition: ['readonly'],
  });
  expect(typeof onCloseOf(server)).toBe('function');
});

it('wires nothing when the host states transportCloseEndsSession: false', () => {
  const server = new EmbeddableMcpServer({
    connection,
    exposition: ['readonly'],
    transportCloseEndsSession: false,
  });
  expect(onCloseOf(server)).toBeUndefined();
});
