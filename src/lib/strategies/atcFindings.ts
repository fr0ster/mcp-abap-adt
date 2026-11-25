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
import {
  about,
  type Column,
  headShape,
  type RowSchemas,
  rows,
  type Written,
  writeListing,
} from '../detail';
import { fragmentStart, hrefParts } from '../sourceHref';
import { parseXml } from '../xml/node';

import {
  child,
  childAt,
  type Element,
  isElement,
  isList,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../xml/tree';

export interface AtcFinding {
  /** `adtcore:name` of the enclosing object element. */
  object: string;
  /** `adtcore:type` — `CLAS`, `FUGR`, `TABL`… */
  object_type: string;
  /** From `location`'s `#start=LINE,COLUMN`, absent when it carries none. */
  line?: number | undefined;
  /** The source the position is in, without the fragment. */
  location?: string | undefined;
  /** 1, 2 or 3 as the document gives it. */
  priority?: number | undefined;
  /** `checkTitle` — what ran, in words. */
  check?: string | undefined;
  /** `messageTitle` — what it found. */
  message?: string | undefined;
}

/** The finding's `quickfixes` element, its flags as the document gives them. */
export interface AtcQuickfixFlags {
  manual?: boolean | undefined;
  automatic?: boolean | undefined;
  pseudo?: boolean | undefined;
  /** `aiBasedQF`. */
  ai_based?: boolean | undefined;
  /** `ai_enabled`. */
  ai_enabled?: boolean | undefined;
}

/**
 * Everything `detail: 'full'` answers: the terse fields and what else the
 * captured worklist carries per finding.
 */
export interface AtcFindingFull extends AtcFinding {
  /** From `location`'s `#start=LINE,COLUMN`, absent when it carries none. */
  column?: number | undefined;
  /** `checkId`. */
  check_id?: string | undefined;
  /** `checkClass` — the check's ABAP class. */
  check_class?: string | undefined;
  /** `messageId`. */
  message_id?: string | undefined;
  /**
   * The `href` of the finding's `atom:link` whose `rel` is ADT's
   * documentation relation (`/sap/bc/adt/documentation/atc/…`).
   */
  documentation_uri?: string | undefined;
  /** `exemptionApproval`, verbatim (`-` in every captured finding). */
  exemption_approval?: string | undefined;
  /** `exemptionKind`, verbatim; absent when empty. */
  exemption_kind?: string | undefined;
  /** Which kinds of quick fix the finding offers. */
  quickfixes?: AtcQuickfixFlags | undefined;
}

/** The terse fields of a finding, in the order they were always answered. */
/** The terse rows' columns of a finding. */
export const FINDING_COLUMNS = [
  'object',
  'object_type',
  'location',
  'line',
  'column',
  'priority',
  'check',
  'message',
] as const;

/** A finding's cells in a terse row, in {@link FINDING_COLUMNS}' order. */
export function findingCells(finding: AtcFindingFull): string[] {
  return [
    finding.object,
    finding.object_type,
    finding.location ?? '',
    finding.line === undefined ? '' : String(finding.line),
    finding.column === undefined ? '' : String(finding.column),
    finding.priority === undefined ? '' : String(finding.priority),
    finding.check ?? '',
    finding.message ?? '',
  ];
}

/** What each terse column of a finding tells, in domain words. */
const FINDING_MEANS: Readonly<
  Record<(typeof FINDING_COLUMNS)[number], string>
> = {
  object: 'its object',
  object_type: "its object's type",
  location: 'the part of the source it is in',
  line: 'its position in that source',
  column: 'its offset at that position',
  priority: 'its priority',
  check: 'the check that found it',
  message: 'what the check says',
};

/** The lists a findings listing writes: what its description states. */
export const FINDINGS_LISTS: RowSchemas<{
  findings: readonly AtcFindingFull[];
}> = {
  findings: about(
    'for each finding',
    rows('findings', {
      columns: FINDING_COLUMNS.map(
        (name, index): Column<AtcFindingFull> => ({
          name,
          means: FINDING_MEANS[name],
          cell: (finding) => findingCells(finding)[index] ?? '',
        }),
      ),
      header: 'always',
    }),
  ),
};

/** The head of the counts per priority every findings listing writes. */
export const PRIORITY_HEAD = headShape(
  'priority',
  'how many findings each priority has',
);

/**
 * Findings as terse lines: the run's facts as `#` lines (the counts per
 * priority as `priority N count` lines), then a row per finding — every
 * finding, by the listing writer.
 */
export function findingsText(
  heads: readonly { head: string; value?: string | undefined }[],
  byPriority: Record<string, number>,
  findings: readonly AtcFindingFull[],
): Written<string> {
  return writeListing({
    heads: [
      ...heads,
      ...Object.entries(byPriority).map(([priority, count]) => ({
        head: 'priority',
        value: `${priority} ${count}`,
      })),
    ],
    reading: { findings },
    lists: FINDINGS_LISTS,
  });
}

export function terseFinding(finding: AtcFindingFull): AtcFinding {
  return {
    object: finding.object,
    object_type: finding.object_type,
    location: finding.location,
    line: finding.line,
    priority: finding.priority,
    check: finding.check,
    message: finding.message,
  };
}

export interface AtcWorklistReading {
  findings: AtcFindingFull[];
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

export type { Element };

/**
 * One element, several, or none — all three arrive here as a list. A member
 * of a list that is not an element (an empty `<object/>` parses to `''`) is
 * an element with nothing in it.
 */
function asList(value: XmlRead): Element[] {
  if (isList(value)) return value.map((m) => (isElement(m) ? m : {}));
  if (isElement(value)) return [value];
  return [];
}

const attribute = (element: Element, name: string): string | undefined => {
  const value = child(element['@'], name);
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * `/…/source/main#start=9,0` → the source, the 9 and the 0. ADT separates the
 * fragment's parts with `;` — `#start=8,0;end=8,0`,
 * `#type=CLAS%2FOM;name=POST;start=29` — and `start` is `LINE[,COLUMN]`
 * (`fragmentStart`, the one reader of an href's fragment).
 */
function position(location: string | undefined): {
  location?: string;
  line?: number | undefined;
  column?: number | undefined;
} {
  if (!location) return {};
  const { uri, fragment } = hrefParts(location);
  if (fragment === undefined) return { location: uri };
  const start = fragmentStart(fragment);
  if (start === undefined) return { location: uri };
  return { location: uri, line: start.line, column: start.column };
}

const DOCUMENTATION_RELATION = 'http://www.sap.com/adt/relations/documentation';

/** The `href` of the finding's documentation link. */
function documentationUri(finding: Element): string | undefined {
  const link = asList(finding.link).find(
    (l) => attribute(l, 'rel') === DOCUMENTATION_RELATION,
  );
  return link ? attribute(link, 'href') : undefined;
}

/** `"true"` / `"false"` as booleans; anything else is absent. */
function flag(element: Element, name: string): boolean | undefined {
  const value = attribute(element, name);
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

/** The finding's `quickfixes` element, when it has one. */
function quickfixes(finding: Element): AtcQuickfixFlags | undefined {
  const [element] = asList(finding.quickfixes);
  if (!element) return undefined;
  return {
    manual: flag(element, 'manual'),
    automatic: flag(element, 'automatic'),
    pseudo: flag(element, 'pseudo'),
    ai_based: flag(element, 'aiBasedQF'),
    ai_enabled: flag(element, 'ai_enabled'),
  };
}

export function parseAtcWorklist(document: string): AtcWorklistReading {
  const parsed: XmlRead = parseXml(parser, document);
  return readAtcObjects(childAt(parsed, 'worklist', 'objects'));
}

/** The XML parser every ATC document here is read with: SAP's document, unread. */
export function parseAtcDocument(document: string): XmlRead {
  return parseXml(parser, document);
}

/** One element, several, or none, as a list: for the readers of other ATC documents. */
export const atcElements = asList;

/**
 * The findings of the `objects` element of a worklist or of an ATC result:
 * both carry `atcobject:object` elements with `atcobject:findings` of
 * `atcfinding:finding`.
 */
export function readAtcObjects(objectsElement: XmlRead): AtcWorklistReading {
  const findings: AtcFindingFull[] = [];
  const by_priority: Record<string, number> = {};
  let objects_checked = 0;

  for (const objects of asList(objectsElement)) {
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
            check_id: attribute(finding, 'checkId'),
            check_class: attribute(finding, 'checkClass'),
            message_id: attribute(finding, 'messageId'),
            documentation_uri: documentationUri(finding),
            exemption_approval: attribute(finding, 'exemptionApproval'),
            exemption_kind: attribute(finding, 'exemptionKind'),
            quickfixes: quickfixes(finding),
          });
        }
      }
    }
  }

  return { findings, objects_checked, by_priority };
}
