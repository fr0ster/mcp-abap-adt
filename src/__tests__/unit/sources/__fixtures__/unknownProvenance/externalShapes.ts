// The closed rule, a callback's parameter written without a type, in every
// position a third party's contract types it (`node_modules/
// external-contracts`): in a list, a tuple, a rest, a spread, and from a
// receiver the third party instantiated — called, or assigned later. Its
// `unknown` is the third party's unless proven ours: refused by default.
import {
  type Generic,
  type Listener,
  listenAll,
  listenPair,
  restListeners,
  specialised,
  subscribeTo,
} from './node_modules/external-contracts';

type ToolArgs = Readonly<Record<string, unknown>>;

// Refused: a list, a tuple, a rest, a spread.
export function positions(): void {
  listenAll([(value) => String(typeof value === 'string')]);
  listenPair([(value) => String(typeof value === 'string')]);
  restListeners((value) => String(typeof value === 'string'));
  restListeners(...[(value: unknown) => String(value)]);
  restListeners(...[(value) => String(typeof value === 'string')]);
}

// Refused: a receiver the third party instantiated, called or assigned.
export function receiver(): void {
  specialised.subscribe((value) => String(typeof value === 'string'));
  specialised.consume = (value) => String(typeof value === 'string');
}

// Passes: a receiver of ours, its type argument written here.
export function ours(mine: Generic<string>): void {
  mine.subscribe((value) => String(value.length > 0));
  mine.consume = (value) => String(value.length > 0);
}

// Passes: bound by us — a value of ours binds the call's type parameter, a
// type argument we wrote in an annotation binds the alias.
export function boundByUs(args: ToolArgs): void {
  subscribeTo((value) => String(value.name !== undefined), args);
  const listener: Listener<ToolArgs> = (value) =>
    String(value.name !== undefined);
  listener(args);
}
