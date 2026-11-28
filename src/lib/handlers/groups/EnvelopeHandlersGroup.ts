/**
 * The read envelopes in the core and core-ro sets (spec §1), every
 * transport: `CreateReadEnvelope`, `ExecuteReadEnvelope`,
 * `DiscardReadEnvelope`, `ListReadEnvelopes`. Create, discard and list work on
 * no connection (`connectionless`); execute sends on the instance's.
 */
import {
  CREATE_TOOL,
  DISCARD_TOOL,
  EXECUTE_TOOL,
  handleCreateReadEnvelope,
  handleDiscardReadEnvelope,
  handleExecuteReadEnvelope,
  handleListReadEnvelopes,
  LIST_TOOL,
} from '../../../handlers/read_envelope/readonly/readEnvelopeTools';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/** The four tools; each handler takes `(context, args)`. */
export function envelopeToolEntries(): HandlerEntry[] {
  return [
    {
      ...defineTool(CREATE_TOOL, handleCreateReadEnvelope),
      connectionless: true as const,
    },
    defineTool(EXECUTE_TOOL, handleExecuteReadEnvelope),
    {
      ...defineTool(DISCARD_TOOL, handleDiscardReadEnvelope),
      connectionless: true as const,
    },
    {
      ...defineTool(LIST_TOOL, handleListReadEnvelopes),
      connectionless: true as const,
    },
  ];
}

export class EnvelopeHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'EnvelopeHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return envelopeToolEntries();
  }
}
