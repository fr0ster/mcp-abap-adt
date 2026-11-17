// The origin report, EXTERNAL: a third party's value, a call's answer and a
// callback's parameter its contract types — named by the package's manifest
// (`name@version`) and the member that brings the `unknown`.
import {
  makeGeneric,
  raw,
  subscribe,
} from './node_modules/external-contracts';

export const kept = String(raw);

export const made = makeGeneric();

export function listened(): void {
  subscribe((value) => {
    void String(value);
  });
}
