// Passes: a parsed document's structured values — an attribute, a code
// element, an exact relation — compared; a URI's fragment cut.
import { XMLParser } from 'fast-xml-parser';
import { attr, child, childAt } from '../../../../../../lib/thrownValue';

const parser = new XMLParser({ ignoreAttributes: false });

export function reading(document: string): boolean {
  const parsed: unknown = parser.parse(document);
  const data = childAt(parsed, 'asx:abap', 'asx:values', 'DATA');
  const link = childAt(parsed, 'dump', 'link');
  const uri = attr(link, '@_uri') ?? '';
  return (
    child(data, 'CHECK_RESULT') === 'X' &&
    child(data, 'SEVERITY') !== 'ERROR' &&
    attr(link, '@_relation') ===
      'http://www.sap.com/adt/relations/runtime/dump/termination' &&
    uri.indexOf('#') >= 0
  );
}
