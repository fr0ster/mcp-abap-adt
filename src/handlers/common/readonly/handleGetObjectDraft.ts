import * as z from 'zod';
/**
 * GetObjectDraft — whether an object holds an unactivated change, and whose
 * (spec §5): each part's active, inactive and working versions read
 * together, their ETags compared. The answer is facts only; no setting or
 * check of the server acts on it.
 */
import type { ProjectionVariant } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer, answerCaught } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import { draftOf } from '../../../lib/draft/draftOf';
import { DRAFT_TYPES, draftRuleOf } from '../../../lib/draft/draftTypes';
import { readDraftEtags } from '../../../lib/draft/readDraftEtags';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';

export const TOOL_DEFINITION = {
  name: 'GetObjectDraft',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Reads whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose.',
      ),
    }),
    inputSchema: objectDraftSchema(variant),
  })),
} as const;

/** GetObjectDraft's input on `variant`. */
function objectDraftSchema(variant: ProjectionVariant) {
  return z.object({
    object_type: z.enum(DRAFT_TYPES[variant]).describe('Object type.'),
    object_name: z.string().describe('Object name.'),
    function_group_name: z
      .string()
      .optional()
      .describe('The function group of a FUNCTION_MODULE (required for it).'),
  });
}

type GetObjectDraftArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

const CONTEXT = { tool: 'GetObjectDraft', detail: 'terse' } as const;

export async function handleGetObjectDraft(
  context: HandlerContext,
  args: GetObjectDraftArgs,
) {
  const { connection, logger } = context;
  const variant = variantOf(connection);
  const type = acceptedOf(args.object_type, DRAFT_TYPES[variant]);
  if (type === undefined) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${DRAFT_TYPES[variant].join(', ')}`,
      ),
    );
  }
  const name = args.object_name.trim().toUpperCase();
  if (name === '') return return_error(new Error('object_name is required'));
  const group = args.function_group_name?.trim().toUpperCase() ?? '';
  if (type === 'FUNCTION_MODULE' && group === '') {
    return return_error(
      new Error('function_group_name is required for a FUNCTION_MODULE'),
    );
  }
  const read = await readDraftEtags(
    createAdtClient(connection, logger),
    {
      type,
      name,
      functionGroup: type === 'FUNCTION_MODULE' ? group : undefined,
    },
    variant,
  );
  if (!read.ok) {
    const failure = read.failure;
    return failure.kind === 'threw'
      ? answerCaught(failure.thrown, CONTEXT)
      : answer(
          CONTEXT,
          async () => failure.response,
          () => null,
        );
  }
  const now = new Date();
  const rule = draftRuleOf(type);
  const parts = read.parts.map(({ part, etags }) => ({
    part,
    ...draftOf(etags, now, rule),
  }));
  return return_response({
    data: JSON.stringify({
      object_type: type,
      object_name: name,
      has_draft: parts.some(
        (part) => part.draft === 'own' || part.draft === 'other',
      ),
      parts,
    }),
  });
}
