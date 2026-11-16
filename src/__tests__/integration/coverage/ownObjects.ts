/**
 * What the coverage live suites share: the package a run may create in,
 * the request it writes on, and how an answer is read.
 *
 * **The package.** `$TMP` or the development package on premise, the build
 * package on the cloud (which has no `$TMP`): the configured package must be
 * exactly one of them, read before anything is created; otherwise the case
 * refuses, naming only the accepted ones (as
 * `activateObjectsRefusal.live.test.ts` does).
 */
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import type { LiveAnswer } from '../helpers/live';
import { CREATION_PACKAGES } from '../helpers/packageGuard';

/** Whether the configured system is the on-premise one. */
export const onPremise = (): boolean => configuredSystemKind() === 'onprem';

/**
 * The package a case creates in: `$TMP` on premise, the configured package
 * on the cloud — each checked against the accepted ones first.
 */
export function ownPackage(): string {
  const accepted = CREATION_PACKAGES[onPremise() ? 'onprem' : 'cloud'];
  const chosen = onPremise() ? '$TMP' : resolvePackageName();
  if (!accepted.includes(chosen)) {
    throw new Error(
      `the package is none of ${accepted.join(', ')}: nothing is created`,
    );
  }
  return chosen;
}

/**
 * The request a write goes on: none for `$TMP`, else the configured one
 * (none when none is configured). As a property value, for a `liveCall`'s
 * literal arguments.
 */
export function request(): string | undefined {
  if (ownPackage() === '$TMP') return undefined;
  const configured = resolveTransportRequest();
  return configured === undefined || configured === '' ? undefined : configured;
}

/** No request for `$TMP`; the configured one for any other package. */
export function onRequest(): { transport_request?: string } {
  const given = request();
  return given === undefined ? {} : { transport_request: given };
}

/** The answer, or the case fails naming the step and what was answered. */
export function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
export function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** An answer's JSON payload. */
export function payloadOf(answer: LiveAnswer): unknown {
  return JSON.parse(answer.text);
}
