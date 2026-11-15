// The closed rule, provenance through members and returns: a member, an
// accessor, an interface member, a return or a re-export of ours is ours
// only when its written type holds the `unknown` through text we wrote; one
// with no written type is traced to its initializer or what it returns.
// `typeof` a third party's value, or its alias, is not our text.
import * as reexported from './externalReexport';
import * as via from './ownReexportVia';
import {
  type Generic,
  Holder,
  makeFixed,
  makeOf,
  specialised,
} from './node_modules/external-contracts';

type ToolArgs = Readonly<Record<string, unknown>>;

interface Typed {
  readonly receiver: typeof specialised;
}

interface Carrier {
  readonly receiver: Generic<ToolArgs>;
}

function ownFactory() {
  return specialised;
}

function ownTyped(given: Generic<ToolArgs>): Generic<ToolArgs> {
  return given;
}

function wrap<T>(value: T): { value: T } {
  return { value };
}

const accessors = {
  get receiver() {
    return specialised;
  },
};

// Refused: a member whose unknown no text of ours binds.
export function members(holder: Typed): void {
  const box = { receiver: specialised };
  box.receiver.subscribe((value) => String(typeof value === 'string'));
  accessors.receiver.subscribe((value) => String(typeof value === 'string'));
  holder.receiver.subscribe((value) => String(typeof value === 'string'));
  wrap(specialised).value.subscribe((value) =>
    String(typeof value === 'string'),
  );
  reexported.specialised.subscribe((value) =>
    String(typeof value === 'string'),
  );
}

// Refused: a return of ours with no written type, traced to a third party.
export function returns(): void {
  ownFactory().subscribe((value) => String(typeof value === 'string'));
  const made = ownFactory();
  made.subscribe((value) => String(typeof value === 'string'));
}

// Passes: ours — a member, a return, a wrapper bound by text we wrote.
export function ours(mine: Generic<ToolArgs>, carrier: Carrier): string {
  let seen = '';
  const box = { receiver: mine };
  box.receiver.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  carrier.receiver.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  ownTyped(mine).subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  wrap(mine).value.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  return seen;
}

// Refused: a member traced to a factory whose type's base holds the unknown.
export function based(): void {
  const box = { receiver: makeFixed() };
  box.receiver.subscribe((value) => String(typeof value === 'string'));
}

// Passes: a third party's generic instantiated by text we wrote, `unknown`
// included, is ours (charged where written, not read off the third party).
interface Instantiated {
  readonly receiver: Generic<unknown>;
}

export function instantiatedByUs(
  given: Generic<unknown>,
  carrier: Instantiated,
): string {
  let seen = '';
  given.subscribe((value) => {
    seen += String(typeof value === 'string');
  });
  carrier.receiver.subscribe((value) => {
    seen += String(typeof value === 'string');
  });
  new Holder<unknown>().subscribe((value) => {
    seen += String(typeof value === 'string');
  });
  makeOf<unknown>().subscribe((value) => {
    seen += String(typeof value === 'string');
  });
  return seen;
}

// Refused: a member written `typeof` a third party's value, read off a
// receiver of ours.
export class Theirs {
  readonly theirs: typeof specialised = specialised;

  listen(): void {
    this.theirs.subscribe((value) => String(typeof value === 'string'));
  }
}

// Passes: a value of ours re-exported through a namespace of ours.
export function reexportedOurs(): string {
  let seen = '';
  via.ownGiven.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  return seen;
}
