// The origin report, LANGUAGE: a catch binding, and a member the language
// declares `unknown` (`Error.cause`).
export function caught(work: () => void): string {
  try {
    work();
    return '';
  } catch (error) {
    return String(error);
  }
}

export function cause(failure: Error): string {
  return String(failure.cause);
}
