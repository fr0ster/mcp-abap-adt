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
 * and what. Both halves are needed: `atcfinding:location` names the source
 * position, which for a function module is the include rather than the
 * object the run was asked about.
 */

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

const OBJECT_ELEMENT =
  /<atcobject:object\b([^>]*)>([\s\S]*?)<\/atcobject:object>/g;
const SELF_CLOSING_OBJECT = /<atcobject:object\b([^>]*)\/>/g;
const FINDING_ELEMENT = /<atcfinding:finding\b([^>]*?)\/?>/g;

const attribute = (source: string, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  return match?.[1];
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

  for (const object of document.matchAll(OBJECT_ELEMENT)) {
    objects_checked += 1;
    const name = attribute(object[1], 'adtcore:name') ?? '';
    const type = attribute(object[1], 'adtcore:type') ?? '';

    for (const finding of object[2].matchAll(FINDING_ELEMENT)) {
      const attributes = finding[1];
      const priority = attribute(attributes, 'atcfinding:priority');
      if (priority) by_priority[priority] = (by_priority[priority] ?? 0) + 1;
      findings.push({
        object: name,
        object_type: type,
        ...position(attribute(attributes, 'atcfinding:location')),
        priority: priority ? Number(priority) : undefined,
        check: attribute(attributes, 'atcfinding:checkTitle'),
        message: attribute(attributes, 'atcfinding:messageTitle'),
      });
    }
  }

  // An object with nothing to report comes back self-closing — the majority,
  // on a clean run. They carry no finding, but they are objects the run
  // covered, and a count that left them out would make a clean package look
  // like a package nothing looked at.
  for (const _ of document.matchAll(SELF_CLOSING_OBJECT)) objects_checked += 1;

  return { findings, objects_checked, by_priority };
}
