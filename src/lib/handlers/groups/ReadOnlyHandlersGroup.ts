import {
  TOOL_DEFINITION as GetEnhancementImpl_Tool,
  handleGetEnhancementImpl,
} from '../../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import {
  TOOL_DEFINITION as GetEnhancementSpot_Tool,
  handleGetEnhancementSpot,
} from '../../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import {
  TOOL_DEFINITION as GetEnhancements_Tool,
  handleGetEnhancements,
} from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import {
  TOOL_DEFINITION as GetInclude_Tool,
  handleGetInclude,
} from '../../../handlers/include/readonly/handleGetInclude';
import {
  TOOL_DEFINITION as GetIncludesList_Tool,
  handleGetIncludesList,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import {
  TOOL_DEFINITION as GetPackageContents_Tool,
  handleGetPackageContents,
} from '../../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as GetProgFullCode_Tool,
  handleGetProgFullCode,
} from '../../../handlers/program/readonly/handleGetProgFullCode';
// Import readonly handlers
// Import TOOL_DEFINITION from handlers
import {
  TOOL_DEFINITION as GetTableContents_Tool,
  handleGetTableContents,
} from '../../../handlers/table/readonly/handleGetTableContents';
import {
  TOOL_DEFINITION as GetTransport_Tool,
  handleGetTransport,
} from '../../../handlers/transport/readonly/handleGetTransport';
import {
  handleListTransports,
  TOOL_DEFINITION as ListTransports_Tool,
} from '../../../handlers/transport/readonly/handleListTransports';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * Handler group for all readonly (read-only) handlers.
 * Contains handlers that only read data without modifying the ABAP system.
 */
export class ReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'ReadOnlyHandlers';

  /**
   * Gets all readonly handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: GetTableContents_Tool,
        handler: (args: any) => handleGetTableContents(this.context, args),
      },
      {
        toolDefinition: GetPackageContents_Tool,
        handler: (args: any) => handleGetPackageContents(this.context, args),
      },
      {
        toolDefinition: GetInclude_Tool,
        handler: (args: any) => handleGetInclude(this.context, args),
      },
      {
        toolDefinition: GetIncludesList_Tool,
        handler: (args: any) => handleGetIncludesList(this.context, args),
      },
      {
        toolDefinition: GetEnhancements_Tool,
        handler: (args: any) => handleGetEnhancements(this.context, args),
      },
      {
        toolDefinition: GetEnhancementSpot_Tool,
        handler: (args: any) => handleGetEnhancementSpot(this.context, args),
      },
      {
        toolDefinition: GetEnhancementImpl_Tool,
        handler: (args: any) => handleGetEnhancementImpl(this.context, args),
      },
      {
        toolDefinition: GetTransport_Tool,
        handler: (args: any) => handleGetTransport(this.context, args),
      },
      {
        toolDefinition: ListTransports_Tool,
        handler: (args: any) => handleListTransports(this.context, args),
      },
      {
        toolDefinition: GetProgFullCode_Tool,
        handler: (args: any) => handleGetProgFullCode(this.context, args),
      },
    ];
  }
}
