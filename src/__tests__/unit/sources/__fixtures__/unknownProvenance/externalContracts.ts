// The closed rule, a contract declared outside the repository
// (`node_modules/external-contracts`): a callback's parameter written
// without a type takes the `unknown` or `any` the third party wrote —
// through a generic it instantiated, a method of an object literal its
// contract types, any of its overloads — and is judged exactly
// as one written with it. A type argument of ours is ours.
import {
  drain,
  receive,
  subscribe,
  subscribeTo,
} from './node_modules/external-contracts';

// Refused: a generic the third party instantiated with `unknown`.
export function generic(): void {
  subscribe((value) => {
    if (typeof value === 'string') drain(String);
  });
}

// Refused: a shorthand method of a literal its contract types.
export function method(): void {
  receive({
    consume(value) {
      if (typeof value === 'string') drain(String);
    },
  });
}

// Refused: one overload hands `unknown`.
export function overloaded(): void {
  drain((value) => {
    if (typeof value === 'string') subscribe(String);
  });
}

// Passes: bound by the caller — a value of ours instantiates the generic.
export function bound(given: string): void {
  subscribeTo((value) => {
    if (value.length > 0) drain(String);
  }, given);
}
