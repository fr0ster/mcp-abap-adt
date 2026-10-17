/**
 * The system parameters are kept per resolver and connection, and the
 * keeping must not hold a connection. An HTTP server makes a connection and
 * a credential for every request; 200 of them, one after the other, go
 * through the path that keeps the parameters (`withResolvedSystemContext`,
 * with the responsible rules' kind of rule). After a collection no
 * per-request connection and no per-request credential is retained by the
 * store.
 *
 * Proved with a `FinalizationRegistry` probe: the repo has no other GC test,
 * and a probe needs no child process. `gc` is exposed in this process
 * through V8's own flag.
 */

import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type SystemContextResolver,
  type SystemContextRules,
  withResolvedSystemContext,
} from '../../../lib/requestSystemResolution';

setFlagsFromString('--expose-gc');
const collect = runInNewContext('gc') as () => void;

const REQUESTS = 200;

/** Collects until `done()` holds or the attempts are spent. */
async function collectUntil(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !done(); attempt++) {
    collect();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('the kept system parameters retain no per-request connection', () => {
  it('after 200 sequential requests none of their connections or credentials is retained', async () => {
    // One resolver and one rules object for the process, as a host has them;
    // neither refers to a connection.
    const resolver: SystemContextResolver = async () => ({
      responsible: 'RESPONSIBLE',
      masterSystem: 'SID',
    });
    const rules: SystemContextRules = {
      parametersFor: (lookup) => lookup.system,
    };

    const finalized = { connections: 0, credentials: 0 };
    const connectionProbe = new FinalizationRegistry<number>(() => {
      finalized.connections += 1;
    });
    const credentialProbe = new FinalizationRegistry<number>(() => {
      finalized.credentials += 1;
    });

    // The per-request objects live only inside this function, so nothing of
    // the test holds them once it returns.
    async function request(index: number): Promise<void> {
      const credential = { token: `credential-${index}` };
      const connection = { credential } as unknown as IAbapConnection;
      connectionProbe.register(connection, index);
      credentialProbe.register(credential, index);
      const seen = await withResolvedSystemContext(
        connection,
        () => 'ran',
        resolver,
        undefined,
        rules,
      );
      expect(seen).toBe('ran');
    }

    for (let index = 0; index < REQUESTS; index++) {
      await request(index);
    }

    await collectUntil(
      () =>
        finalized.connections === REQUESTS &&
        finalized.credentials === REQUESTS,
    );

    expect(finalized).toEqual({
      connections: REQUESTS,
      credentials: REQUESTS,
    });
  });
});
