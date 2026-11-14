// Refused (search ×2): the old validation reading — a single word searched in
// the exception's message, read out of the parsed document.
import { XMLParser } from 'fast-xml-parser';
import { child } from '../../../../../../lib/outsideValue';

export function exists(body: string): boolean {
  const parser = new XMLParser({ ignoreAttributes: false });
  const exception = child(parser.parse(body), 'exc:exception');
  const msgText = child(exception, 'message');
  if (typeof msgText !== 'string') return false;
  const msgLower = msgText.toLowerCase();
  return msgLower.includes('exist') && msgLower.includes('table');
}
