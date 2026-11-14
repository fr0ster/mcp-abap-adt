/**
 * The patch step of a metadata update: read, patch, write.
 *
 * The patch is adt-clients' (`patch<Type>Document`, 45.2.0): it takes the
 * document `readMetadata` answered and the fields the handler names, and
 * answers that document with exactly those changes, or a refusal and no
 * document. The server keeps no XML patcher of its own; what stays here is
 * the handler's choice of values (defaults, upper-casing, label lengths) and
 * how a refusal is answered: a failure of the step {@link PATCH_STEP}, code
 * {@link DOCUMENT_NOT_PATCHED}, its words naming the field the document had
 * no place for. Nothing is written after a refusal.
 *
 * **Why a refusal and never a pass-through.** ADT answers a read of an
 * object that is not ready yet with HTTP 200 and an empty body, never a 404
 * (a live failure: a domain whose description was given was refused with
 * "The description is missing", because a slow read left nothing to patch
 * and the PUT went without it). The library refuses such a read
 * (`not-a-document`); the handler answers that, instead of writing a
 * document that lost what the caller gave.
 */

import type {
  DocumentPatch,
  DocumentPatchRefusal,
} from '@mcp-abap-adt/adt-clients';
import { withStep } from './step';
import { failed, type StepResponse, succeeded } from './stepResponse';

/** The step a refused patch names. */
export const PATCH_STEP = 'patch';

/** The code of a refused patch: the document read could not be patched. */
export const DOCUMENT_NOT_PATCHED = 'DOCUMENT_NOT_PATCHED';

/** The words of a refusal, about the document of `what` (`domain ZD`). */
function refusalWords<F extends string>(
  refusal: DocumentPatchRefusal<F>,
  what: string,
): string {
  switch (refusal.kind) {
    case 'not-a-document':
      return (
        `The read of ${what} answered no document that can be patched; nothing was written. ` +
        'ADT answers a read of an object that is not ready yet with HTTP 200 and an empty body.'
      );
    case 'not-this-type':
      return `The read of ${what} answered a ${refusal.root} document, not its own; nothing was written.`;
    case 'element-missing':
      return `The document of ${what} has no ${refusal.path} for the field ${refusal.field}; nothing was written.`;
  }
}

/**
 * The patch's answer as a step's: the patched document, or the refusal as a
 * failure of the step {@link PATCH_STEP}.
 */
export function patchedDocument<F extends string>(
  patch: DocumentPatch<F>,
  what: string,
): StepResponse<string> {
  if (patch.ok) return succeeded(patch.document, PATCH_STEP);
  return failed(
    withStep(
      {
        origin: 'refusal',
        code: DOCUMENT_NOT_PATCHED,
        message: refusalWords(patch.refusal, what),
      },
      PATCH_STEP,
    ),
    PATCH_STEP,
  );
}
