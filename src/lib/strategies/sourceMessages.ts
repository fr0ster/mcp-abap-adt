/**
 * Where an activation or check message stands, as SAP states it.
 *
 * A checklist `msg` (`chkl:messages`, what `/activation` and a run's results
 * answer) carries `objDescr` (the object and its part, "Class ZCL_X, Method
 * GET_VALUE"), `href` and `code`. A check run's `chkrun:checkMessage` carries
 * `chkrun:uri` and `chkrun:code`, and no line attribute. The source position
 * of both is the `#start=LINE,COLUMN[;end=LINE,COLUMN]` of that href
 * (`readSourceHref`). A checklist `msg`'s `line` attribute is the message's
 * ordinal — `1`, `2`, `3` beside `#start=4,11`, `#start=2,36`,
 * `#start=3,17;end=3,29` in the recorded runs, `0` beside an empty href — so
 * nothing here reads it (fr0ster/mcp-abap-adt#351).
 */
import { readSourceHref, type SourcePosition } from '../sourceHref';
import { childAt, text, type XmlRead } from '../xml/tree';
import { attributeOf } from './reading';

/** What a message says of where it stands: each field only where SAP states it. */
export type MessageLocation = {
  /** `objDescr`: the object, and its part, the message is about. */
  readonly object?: string;
  /** The source the href names, its fragment left out. */
  readonly uri?: string;
  /** The href's `#start=` (and `end=`): line from 1, column from 0. */
  readonly position?: SourcePosition;
  /** SAP's message code (`MESSAGE(GTH)`, `D0(408)`). */
  readonly code?: string;
};

/** A message of a checklist or a check run: its type and words, and where it stands. */
export type SourceMessage = MessageLocation & {
  readonly type: string;
  readonly text: string;
};

/**
 * The location fields of a message, from what it states: an empty or absent
 * value adds nothing, and an href adds its uri and, where its fragment states
 * one, its position.
 */
export function messageLocation(stated: {
  href?: string | undefined;
  object?: string | undefined;
  code?: string | undefined;
}): MessageLocation {
  const source =
    stated.href === undefined ? undefined : readSourceHref(stated.href);
  return {
    ...(stated.object ? { object: stated.object } : {}),
    ...(source ? { uri: source.uri } : {}),
    ...(source?.position ? { position: source.position } : {}),
    ...(stated.code ? { code: stated.code } : {}),
  };
}

/** A checklist `msg`'s words: its `shortText`'s `txt`, else its `objDescr`. */
function checklistWords(msg: XmlRead): string | undefined {
  return text(childAt(msg, 'shortText', 'txt')) || attributeOf(msg, 'objDescr');
}

/**
 * A checklist `msg` (parsed by `parseStructure`): its type, its words, and
 * where it stands.
 */
export function checklistMessage(msg: XmlRead) {
  return {
    type: attributeOf(msg, 'type'),
    text: checklistWords(msg),
    ...messageLocation({
      href: attributeOf(msg, 'href'),
      object: attributeOf(msg, 'objDescr'),
      code: attributeOf(msg, 'code'),
    }),
  };
}

/**
 * A check run's `chkrun:checkMessage` (parsed by `parseStructure`): its type,
 * its words, and where it stands.
 */
export function checkRunMessage(message: XmlRead) {
  return {
    type: attributeOf(message, 'chkrun:type'),
    text: attributeOf(message, 'chkrun:shortText'),
    ...messageLocation({
      href: attributeOf(message, 'chkrun:uri'),
      code: attributeOf(message, 'chkrun:code'),
    }),
  };
}
