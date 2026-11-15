// The closed rule, `this` and long chains: `this` is ours only for what our
// class's own text binds — type arguments it writes in its heritage
// (`extends Holder<unknown>`, the owner's decision), a base of ours so
// written — and a type is walked whole for an unknown, however long its
// chain of bases.
import {
  deep,
  deepDefault,
  Holder,
  TaintedBase,
} from './node_modules/external-contracts';

// Refused: an inherited third-party default.
export class DefaultBase extends Holder {
  inspect(): void {
    this.subscribe((value) => String(typeof value === 'string'));
  }
}

// Refused: a base of ours that inherits the default.
export class OwnChain extends DefaultBase {
  more(): void {
    this.subscribe((value) => String(typeof value === 'string'));
  }
}

// Refused: an unknown five bases down.
export function chained(): void {
  deep().subscribe((value) => String(typeof value === 'string'));
  const kept = deep();
  kept.subscribe((value) => String(typeof value === 'string'));
  const box = { receiver: deep() };
  box.receiver.subscribe((value) => String(typeof value === 'string'));
}

// Refused: a function that rebinds `this` proves nothing.
export class Rebound extends Holder<unknown> {
  inspect(): void {
    const self = this;
    function later(this: Rebound): void {
      this.subscribe((value) => String(typeof value === 'string'));
    }
    later.call(self);
  }
}

// Passes: type arguments we wrote, `unknown` included, and a base of ours so
// written.
export class WrittenBase extends Holder<unknown> {
  inspect(): void {
    this.subscribe((value) => String(typeof value === 'string'));
  }
}

export class OwnWritten extends WrittenBase {
  more(): void {
    this.subscribe((value) => String(typeof value === 'string'));
  }
}

// Refused: type arguments we wrote, but the base's own base takes a default.
export class OverTainted extends TaintedBase<string> {
  inspect(): void {
    this.subscribe((value) => String(typeof value === 'string'));
  }
}

// Refused: a default type parameter nested five tuples deep.
export function nestedDefault(): void {
  deepDefault((value) => String(typeof value[0][0][0][0][0] === 'string'));
}
