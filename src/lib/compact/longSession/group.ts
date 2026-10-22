/**
 * The long session in the compact sets (`compactToolSetOf`,
 * `compactReadOnlyToolSetOf`), served only on the Streamable HTTP binaries
 * (#308, spec §2): `HandlerSession`. It works on no connection of the
 * instance (`connectionless`), runs at once while a batch is open and is
 * never recorded (`runsBesideBatch`).
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../../handlers/index';
import {
  TOOL_DEFINITION as HandlerSession_Tool,
  handleHandlerSession,
} from './handleHandlerSession';

export function compactLongSessionEntries(): HandlerEntry[] {
  return [
    {
      ...defineTool(HandlerSession_Tool, handleHandlerSession),
      connectionless: true as const,
    },
  ];
}

export class CompactLongSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactLongSessionHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactLongSessionEntries();
  }
}
