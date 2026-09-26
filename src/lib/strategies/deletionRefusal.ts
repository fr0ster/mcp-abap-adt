/**
 * The deletion reading, and the one check this consumer adds to it.
 *
 * `analyseDeletion` and `readDeletionRefusal` are adt-strategies' own. This
 * module carried its own copies while 0.4.0 read only one `del:message` per
 * object (fr0ster/mcp-abap-adt-clients#172) and read an untyped message as an
 * error; 0.5.0 reads every message with its T100 key and lets an untyped one
 * stand beside `isDeleted="true"`, which is all the copies did. They are
 * re-exported from here so the delete handlers keep one import.
 */
import { XMLParser } from 'fast-xml-parser';

export {
  analyseDeletion,
  readDeletionRefusal,
} from '@mcp-abap-adt/adt-strategies';

export interface DeletionMessage {
  type: string;
  text: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

function textOf(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text.trim();
  }
  return '';
}

/**
 * The check's word that the object is not there, when it still permits the
 * delete.
 *
 * An object deleted earlier whose object-directory entry waits on an open
 * request is "deletable" to the check — E19, 2026-09-26: `isDeletable="true"`
 * with W "ZMCP_BLD_I_BDEF does not exist", while a GET of it answered 404.
 * The delete sent after it fails on its own: SWB_TOOL 029 "Error while
 * deleting object … from the database" for a BDEF or a metadata extension,
 * W "Release transport … to remove the object directory entry" for the rest.
 * So there is nothing to delete, and the delete is not sent.
 *
 * Read from the text: the message carries no T100 key to match on. The text
 * is SAP's English one; a logon language that words it otherwise is not
 * recognised here, and the delete is then sent as before.
 */
export function absentPerCheck(document: unknown): DeletionMessage | null {
  if (typeof document !== 'string' || document.trim() === '') return null;
  let parsed: Record<string, any>;
  try {
    parsed = parser.parse(document);
  } catch {
    return null;
  }
  for (const object of asArray<Record<string, any>>(
    parsed?.checkResponse?.object,
  )) {
    for (const message of asArray<Record<string, any>>(object?.message)) {
      const text = textOf(message?.text);
      if (/\bdoes not exist\b/i.test(text)) {
        return {
          type: String(message?.['@type'] ?? '').toUpperCase(),
          text,
        };
      }
    }
  }
  return null;
}
