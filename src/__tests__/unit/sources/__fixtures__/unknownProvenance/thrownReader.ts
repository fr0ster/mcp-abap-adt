// A reader of thrown values: a caught value reaches `describeFailure`, and so
// does an `Error` of our own, handed to it directly.
export function describeFailure(thrown: unknown): string {
  return thrown instanceof Error ? 'an error' : typeof thrown;
}

export function attempt(work: () => void): string {
  try {
    work();
    return 'done';
  } catch (error) {
    return describeFailure(error);
  }
}

export function ownFailure(): string {
  return describeFailure(new Error('own'));
}
