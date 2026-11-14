// Refused (search): the old `absentPerCheck` — a regular expression over a
// deletion message's text, read out of the parsed check document.
import { XMLParser } from 'fast-xml-parser';
import { child, childAt, listOf } from '../../../../../../lib/thrownValue';

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

export function absentPerCheck(document: string): boolean {
  const parsed: unknown = parser.parse(document);
  for (const object of listOf(childAt(parsed, 'checkResponse', 'object'))) {
    for (const message of listOf(child(object, 'message'))) {
      const text = child(message, 'text');
      if (typeof text === 'string' && /\bdoes not exist\b/i.test(text)) {
        return true;
      }
    }
  }
  return false;
}
