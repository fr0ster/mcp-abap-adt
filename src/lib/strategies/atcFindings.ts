/**
 * What an ATC worklist says, small enough to act on.
 *
 * `getFindings()` answers the worklist document as ADT sent it — the runtime
 * family injects no result set, so the shaping is this layer's, the same way
 * it is for every `RuntimeX` tool. And the document is mostly not findings: a
 * run over one package answered 18 KB, of which 21 `atcobject:object`
 * elements were the objects checked, 11 `scaAttribute` elements were column
 * labels for a UI nobody here has, and six were the findings
 * (`atc-findings-worklist` in the corpus, measured 2026-09-20).
 *
 * **Written against that capture, not against a guess.** There was no ATC
 * document in the corpus at all until this tool needed one, and a reading
 * invented from the shape a document *probably* has is how element names
 * nothing sends end up in a parser.
 *
 * An object element carries the object; the finding inside it carries where
 * and what. Both halves are needed: the finding's `location` names the source
 * position, which for a function module is the include rather than the object
 * the run was asked about.
 *
 * **Parsed, not matched.** This read the document with regular expressions
 * over literal `atcobject:`/`atcfinding:`/`adtcore:` prefixes until review
 * pointed out what that costs: an XML prefix is chosen by whoever writes the
 * document, so a byte-for-byte equivalent worklist bound to the same
 * namespaces under `o:`/`f:`/`c:` would have answered no objects and no
 * findings — silently, reading exactly like a clean check. Entities were the
 * other half: a `messageTitle` carrying `&amp;` reached the caller with the
 * escape still in it. `fast-xml-parser` with `removeNSPrefix` settles both,
 * and it is what the ATC parse inside adt-clients uses, and what
 * `reading.ts` and `packageWalk.ts` here use.
 */
import { XMLParser } from 'fast-xml-parser';

export interface AtcFinding {
  /** `adtcore:name` of the enclosing object element. */
  object: string;
  /** `adtcore:type` — `CLAS`, `FUGR`, `TABL`… */
  object_type: string;
  /** From `location`'s `#start=LINE,COLUMN`, absent when it carries none. */
  line?: number;
  /** The source the position is in, without the fragment. */
  location?: string;
  /** 1, 2 or 3 as the document gives it. */
  priority?: number;
  /** `checkTitle` — what ran, in words. */
  check?: string;
  /** `messageTitle` — what it found. */
  message?: string;
}

export interface AtcWorklistReading {
  findings: AtcFinding[];
  /** How many objects the run covered, findings or not. */
  objects_checked: number;
  /**
   * Findings per priority, keyed by the number as a string.
   *
   * Not three named fields: `FINDING_STATS` from the run is a triple whose
   * ordering the client deliberately refuses to name, and naming it here
   * would publish the same guess from the other end.
   */
  by_priority: Record<string, number>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  // The prefixes go, so `atcfinding:priority` and a document that called the
  // same namespace `f:` both arrive as `priority`.
  removeNSPrefix: true,
});

type Element = Record<string, unknown> & { '@'?: Record<string, string> };

/** One element, several, or none — all three arrive here as a list. */
function asList(value: unknown): Element[] {
  if (Array.isArray(value)) return value as Element[];
  if (value && typeof value === 'object') return [value as Element];
  return [];
}

const attribute = (element: Element, name: string): string | undefined => {
  const value = element['@']?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** `/…/source/main#start=9,0` → the source and the 9. */
function position(location: string | undefined): {
  location?: string;
  line?: number;
} {
  if (!location) return {};
  const [uri, fragment] = location.split('#');
  const line = /start=(\d+)/.exec(fragment ?? '')?.[1];
  return { location: uri, line: line ? Number(line) : undefined };
}

export function parseAtcWorklist(document: string): AtcWorklistReading {
  const findings: AtcFinding[] = [];
  const by_priority: Record<string, number> = {};
  let objects_checked = 0;

  const parsed = parser.parse(document) as Element;
  const worklist = (parsed.worklist ?? {}) as Element;

  for (const objects of asList(worklist.objects)) {
    for (const object of asList(objects.object)) {
      // Counted whether or not it found anything: an object with nothing to
      // report still had the checks run over it, and leaving those out would
      // make a clean package look like a package nothing looked at.
      objects_checked += 1;
      const name = attribute(object, 'name') ?? '';
      const type = attribute(object, 'type') ?? '';

      for (const group of asList(object.findings)) {
        for (const finding of asList(group.finding)) {
          const priority = attribute(finding, 'priority');
          if (priority)
            by_priority[priority] = (by_priority[priority] ?? 0) + 1;
          findings.push({
            object: name,
            object_type: type,
            ...position(attribute(finding, 'location')),
            priority: priority ? Number(priority) : undefined,
            check: attribute(finding, 'checkTitle'),
            message: attribute(finding, 'messageTitle'),
          });
        }
      }
    }
  }

  return { findings, objects_checked, by_priority };
}
