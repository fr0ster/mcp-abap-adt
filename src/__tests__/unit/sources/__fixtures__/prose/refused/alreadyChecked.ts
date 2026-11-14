// Refused (search ×3): the old `isAlreadyCheckedError` — an error's message,
// read by key from a value of no type, searched for words.
import { child } from '../../../../../../lib/outsideValue';

export function isAlreadyCheckedError(error: unknown): boolean {
  const errorMessage = String(child(error, 'message') || String(error || ''));
  const msgLower = errorMessage.toLowerCase();
  return (
    msgLower.includes('has been checked') ||
    msgLower.includes('was checked') ||
    msgLower.includes('already checked')
  );
}
