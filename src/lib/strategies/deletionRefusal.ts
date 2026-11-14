/**
 * The deletion reading.
 *
 * `analyseDeletion` and `readDeletionRefusal` are adt-strategies' own. This
 * module carried its own copies while 0.4.0 read only one `del:message` per
 * object (fr0ster/mcp-abap-adt-clients#172) and read an untyped message as an
 * error; 0.5.0 reads every message with its T100 key and lets an untyped one
 * stand beside `isDeleted="true"`, which is all the copies did. They are
 * re-exported from here so the delete handlers keep one import.
 *
 * Nothing here reads a message's words: a check that permits the delete is
 * followed by the delete, whatever its messages say (#1, #11).
 */
export {
  analyseDeletion,
  readDeletionRefusal,
} from '@mcp-abap-adt/adt-strategies';
