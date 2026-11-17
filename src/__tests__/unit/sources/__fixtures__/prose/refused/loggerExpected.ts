// Refused (search ×2): the old logger test of an expected error — the error's
// body searched for an exception type's name and for words.
import { childAt } from '../../../../../../lib/thrownValue';

export function isExpectedError(data: unknown): boolean {
  const responseData = childAt(data, 'response', 'data') || '';
  const allData = String(responseData);
  return (
    allData.includes('InvalidClifName') ||
    allData.includes('does already exist')
  );
}
