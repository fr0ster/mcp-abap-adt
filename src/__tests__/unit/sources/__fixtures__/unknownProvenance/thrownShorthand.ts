// A caught value carried by shorthand (`{ error }`) is still a caught value:
// the slot that holds it beside a typed value of our own is a reader's.
export interface Settled {
  readonly error: unknown;
}

export function settle(work: () => void): Settled | undefined {
  try {
    work();
    return undefined;
  } catch (error) {
    return { error };
  }
}

export function refused(): Settled {
  return { error: 'refused' };
}

// Destructured from the slot, the caught value is still one.
export function rethrown(work: () => void): Settled {
  const settled = settle(work) ?? refused();
  const { error } = settled;
  return { error: error ?? new Error('none') };
}

// A promise's rejection is a thrown value too: its handler's parameter.
export interface Rejected {
  readonly reason: unknown;
}

export function rejectedLater(work: Promise<void>): Promise<Rejected> {
  return work.then(
    (): Rejected => ({ reason: 'resolved' }),
    (rejection: unknown): Rejected => ({ reason: rejection }),
  );
}

// A failure slot: an `Error` of ours beside a value from outside, no catch
// in sight (a promise's rejection reached through a library's combinator).
export interface Outcome {
  readonly failure: unknown;
}

export function outcomeOf(text: string, failed: boolean): Outcome {
  return failed ? { failure: new Error('failed') } : { failure: JSON.parse(text) };
}
