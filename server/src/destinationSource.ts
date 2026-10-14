/**
 * core's `ConnectionSource` (spec §4.1): the destination the process serves,
 * through the destination layer. Per request — with the request's signal —
 * the settings (read once per process by the factory), the provider
 * (`getProvider(destination, { signal })`: the broker's provider, the same
 * one for the process's life) and what the destination's own `.env` states
 * about who creates objects.
 *
 * Each of the three waits races the request's signal (D32): they are shared
 * work (one read, one build, one lookup for every caller), so a cancelled
 * caller settles at once while the work runs on for the others, and a late
 * rejection is handled.
 *
 * The server keeps no provider: asking `getProvider` per request is what
 * carries renewal, a failed session write's refusal and the cancel of a
 * login. On stdio the user is fixed for the process: the session is renewed
 * (refresh token, or a new login when the refresh fails) and written back by
 * that same provider — the same user. The instance's connection is kept
 * while the source answers the same provider (D13), and replaced only when
 * SAP already lost the session (D56), built with the provider `getProvider`
 * answers — the same one.
 */

import {
  type ConnectionSource,
  raceRequestSignal,
} from '@mcp-abap-adt/lib/embeddable';
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
