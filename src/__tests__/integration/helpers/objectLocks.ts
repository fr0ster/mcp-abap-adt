/**
 * What a standalone suite needs to know about locks and about the system it
 * runs on — asked through `@mcp-abap-adt/adt-clients`, never through a URL.
 *
 * **No ADT endpoint is addressed from this repository.** An earlier version of
 * this file built `/sap/bc/adt/deletion/check`,
 * `/sap/bc/adt/ddic/ddlock/locks` and
 * `/sap/bc/adt/core/http/systeminformation` by hand, and kept a table of object
 * URIs to feed them. Every one of those has a member: `checkDeletion` on the
 * object's own accessor, and `getSystemInformation`. The URI table is gone with
 * the requests that needed it.
 *
 * **And the release is gone, not ported.** Releasing a lock held by another
 * session is not a member because ADT offers us nothing that does it — measured
 * on BTP ABAP, 2026-09-24: `ddic/ddlock/locks` answers `404`, that resource does
 * not exist on the system; a stateful `LOCK` with or without `force=true`
 * answers `403` EU510; an `UNLOCK` without a handle answers `200` and changes
 * nothing. So a suite cannot clean up after orphaning a lock, which is why it
 * must not orphan one: lock, write, unlock, and fail loudly if the unlock is
 * refused.
 *
 * What is left here is the part that is useful and honest: say whether an object
 * is locked and by whom, so a refused delete in cleanup reads as what it is.
 */

import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';

/** The accessors whose objects these suites create, and their config key. */
const FAMILY = {
  program: { accessor: 'getProgram', key: 'programName' },
  class: { accessor: 'getClass', key: 'className' },
} as const;

export type LockableFamily = keyof typeof FAMILY;

/**
 * Report whether an object is locked, and by whom. Never throws: this runs in
 * cleanup, where a failure to look must not replace the failure that brought us
 * here.
 *
 * Returns the holder's name when the object is locked, `undefined` otherwise —
 * including when the object does not exist, which is what a quiet answer means
 * after a delete has already succeeded.
 */
export async function lockHolderOf(
  connection: unknown,
  family: LockableFamily,
  objectName: string,
  logger?: { warn?: (message: string) => void; debug?: (m: string) => void },
): Promise<string | undefined> {
  const shape = FAMILY[family];
  try {
    const client = createAdtClient(connection as never) as unknown as Record<
      string,
      () => { checkDeletion: (config: unknown) => Promise<unknown> }
    >;
    const answer = (await client[shape.accessor]().checkDeletion({
      [shape.key]: objectName,
    })) as { ok: boolean; getResult?: () => { value: unknown } };
    if (!answer.ok) return undefined;
    const body = String(answer.getResult?.().value ?? '');
    const holder = body.match(/<del:lockUser>([^<]+)<\/del:lockUser>/)?.[1];
    if (holder) {
      logger?.warn?.(
        `🔒 ${objectName} is locked by ${holder} — a delete aimed at it will be refused, and nothing here can release it`,
      );
    }
    return holder;
  } catch (error: unknown) {
    logger?.debug?.(
      `could not ask about a lock on ${objectName}: ${(error as Error)?.message ?? error}`,
    );
    return undefined;
  }
}

/**
 * Whether this machine has a SAP system configured at all.
 *
 * The one legitimate reason an integration suite may skip itself. Everything
 * else — a missing package, an unset transport, a user the system will not
 * name — is a fault on a machine that HAS a system, and a fault that skips is
 * a fault nobody sees.
 */
export function sapIsConfigured(): boolean {
  const url = process.env.SAP_URL?.split('#')[0].trim();
  return !!url && /^https?:\/\//.test(url);
}

/**
 * Who the current session is, according to the system.
 *
 * `getSystemInformation` is the member for it, and it is a cloud answer: on
 * premise there is nothing behind it and this answers `undefined`, which is the
 * shape a caller wants — the configured `SAP_USERNAME` is the on-premise answer
 * and should win anyway. It exists because a JWT session has no such variable,
 * and a suite that needs an owner was skipping invisibly without one.
 */
export async function systemUserName(
  connection: unknown,
  logger?: { debug?: (message: string) => void },
): Promise<string | undefined> {
  try {
    const info = await getSystemInformation(connection as never);
    const name = String(info?.userName ?? '').trim();
    return name === '' ? undefined : name;
  } catch (error: unknown) {
    logger?.debug?.(
      `getSystemInformation did not answer: ${(error as Error)?.message ?? error}`,
    );
    return undefined;
  }
}
