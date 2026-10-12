/**
 * core's `ConnectionSource` (spec §4.1): the destination the process serves,
 * through the destination layer. Per request — with the request's signal —
 * the settings (read once per process by the factory), the provider
 * (`getProvider(destination, { signal })`: the broker's cached provider
 * while the destination is unchanged, a new one when it built a new one) and
 * what the destination's own `.env` states about who creates objects.
 *
 * Each of the three waits races the request's signal (D32): they are shared
 * work (one read, one build, one lookup for every caller), so a cancelled
 * caller settles at once while the work runs on for the others, and a late
 * rejection is handled.
 *
 * The server keeps no provider: lib's server keeps its connection while this
 * answers the same provider object and builds a new one when it answers a
 * new provider (D13).
 */

import { raceRequestSignal } from '@mcp-abap-adt/lib/auth';
import type { ConnectionSource } from '@mcp-abap-adt/lib/embeddable';
import type { IDestinations } from './auth/IAuthBrokerFactory.js';

export function destinationSource(
  destination: string,
  destinations: IDestinations,
): ConnectionSource {
  return {
    async resolve(signal: AbortSignal) {
      const settings = await raceRequestSignal(
        destinations.settingsFor(destination),
        signal,
      );
      const credential = await raceRequestSignal(
        destinations.getProvider(destination, { signal }),
        signal,
      );
      const systemContext =
        destinations.systemContextFor === undefined
          ? undefined
          : await raceRequestSignal(
              destinations.systemContextFor(destination),
              signal,
            );
      return {
        settings: { ...settings },
        credential,
        ...(systemContext !== undefined ? { systemContext } : {}),
      };
    },
  };
}
