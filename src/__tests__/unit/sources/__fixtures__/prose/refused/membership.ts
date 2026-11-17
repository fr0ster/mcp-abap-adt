// Refused (search): membership of an error's message in a list of words.
const KNOWN: readonly string[] = ['An RFC conversation needs a url'];

export function isKnown(error: Error): boolean {
  return KNOWN.includes(error.message);
}
