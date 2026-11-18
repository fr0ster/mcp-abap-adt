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
import { child, childAt, listOf, text, type XmlRead } from '../xml/tree';
import { attributeOf, parseStructure } from './reading';

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

/**
 * Every message a checklist or a check run document carries, in document
 * order; none for any other document, or one that does not parse.
 */
export function sourceMessagesOf(document: string): SourceMessage[] {
  const parsed = parseStructure(document);
  const checklist = child(parsed, 'chkl:messages');
  const read = checklist
    ? listOf(child(checklist, 'msg')).map(checklistMessage)
    : listOf(childAt(parsed, 'chkrun:checkRunReports', 'chkrun:checkReport'))
        .flatMap((report) =>
          listOf(
            childAt(report, 'chkrun:checkMessageList', 'chkrun:checkMessage'),
          ),
        )
        .map(checkRunMessage);
  return read.map(({ type, text: words, ...location }) => ({
    ...location,
    type: type ?? '',
    text: words ?? '',
  }));
}

/**
 * Messages a strategy read from `document`, each with where it stands: the
 * location of the document's message it was read from — the next one, in
 * document order, with the same words. A message no document message says
 * (a sentence the strategy wrote) stays as it is; so does one that already
 * states a uri or a position.
 */
export function locatedMessages<
  M extends { readonly text: string } & MessageLocation,
>(messages: readonly M[], document: string): Array<M & MessageLocation> {
  const said = sourceMessagesOf(document);
  let next = 0;
  return messages.map((message) => {
    if (message.uri !== undefined || message.position !== undefined) {
      return message;
    }
    const words = message.text.trim();
    for (let at = next; at < said.length; at++) {
      const source = said[at];
      if (source === undefined || source.text.trim() !== words) continue;
      next = at + 1;
      const { type: _type, text: _text, ...location } = source;
      return { ...message, ...location };
    }
    return message;
  });
}
