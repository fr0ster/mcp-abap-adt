// Refused (search ×2): the old `isAlreadyExistsError` — an error's message and
// body, read by key, joined and searched for words.
import { child, childAt } from '../../../../../../lib/outsideValue';

export function isAlreadyExistsError(error: unknown): boolean {
  const errorMessage = String(child(error, 'message') || '');
  const data = childAt(error, 'response', 'data');
  const responseData = typeof data === 'string' ? data : '';
  const msgLower = `${errorMessage} ${responseData}`.toLowerCase();
  return (
    msgLower.includes('already exists') ||
    msgLower.includes('does already exist')
  );
}
