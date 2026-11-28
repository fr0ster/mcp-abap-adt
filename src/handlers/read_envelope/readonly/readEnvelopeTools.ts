/**
 * The read envelopes' four tools (spec §2): create, execute, discard and
 * list. Create, discard and list send nothing and work on no connection;
 * execute sends the envelope on the instance's connection. None of them is
 * recorded.
 */
import * as z from 'zod';
import {
  createEnvelope,
  discardEnvelope,
  executeEnvelopeTool,
  listEnvelopes,
} from '../../../lib/batch/envelopeTools';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { createArguments } from '../../../lib/handlers/createArguments';
import type { HandlerContext } from '../../interfaces';

/** The parameter description of `envelope_handle` on execute and discard. */
const HANDLE_WORDS = 'The handle of the collection, as its creation gave it.';

const handleField = () =>
  z.string().min(1, 'envelope_handle is required').describe(HANDLE_WORDS);

export const CREATE_TOOL = {
  name: 'CreateReadEnvelope',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Creates a collection of read calls under a handle that each of those calls names, sent to SAP together when the collection is executed.',
      ),
    }),
  ),
  // A create tool's arguments are strict: an undeclared one is refused, named.
  inputSchema: createArguments('CreateReadEnvelope', {}),
} as const;

export const EXECUTE_TOOL = {
  name: 'ExecuteReadEnvelope',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Executes a collection of recorded read calls, sending them to SAP together and giving each call's result under its number, in recording order.",
      ),
    }),
  ),
  inputSchema: z.object({ envelope_handle: handleField() }),
} as const;

export const DISCARD_TOOL = {
  name: 'DiscardReadEnvelope',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Discards a collection of recorded read calls and ends its handle, giving how many calls it held.',
      ),
    }),
  ),
  inputSchema: z.object({ envelope_handle: handleField() }),
} as const;

export const LIST_TOOL = {
  name: 'ListReadEnvelopes',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Lists this session's open collections of read calls, each with its handle and how many calls it has recorded.",
      ),
    }),
  ),
  inputSchema: z.object({}),
} as const;

/** `CreateReadEnvelope`: nothing sent, no connection. */
export async function handleCreateReadEnvelope(
  context: HandlerContext,
  _args: z.output<typeof CREATE_TOOL.inputSchema>,
) {
  return createEnvelope(context);
}

/** `ExecuteReadEnvelope`: the claim, then the envelope sent on the call's connection. */
export async function handleExecuteReadEnvelope(
  context: HandlerContext,
  args: z.output<typeof EXECUTE_TOOL.inputSchema>,
) {
  return executeEnvelopeTool(context, args.envelope_handle);
}

/** `DiscardReadEnvelope`: nothing sent, no connection. */
export async function handleDiscardReadEnvelope(
  context: HandlerContext,
  args: z.output<typeof DISCARD_TOOL.inputSchema>,
) {
  return discardEnvelope(context, args.envelope_handle);
}

/** `ListReadEnvelopes`: nothing sent, no connection. */
export async function handleListReadEnvelopes(
  context: HandlerContext,
  _args: z.output<typeof LIST_TOOL.inputSchema>,
) {
  return listEnvelopes(context);
}
