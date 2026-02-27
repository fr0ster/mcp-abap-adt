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
  TOOL_DEFINITION as GetFunction_Tool,
  handleGetFunction,
} from '../../../handlers/function/readonly/handleGetFunction';
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
  TOOL_DEFINITION as ListTransports_Tool,
  handleListTransports,
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
        toolDefinition: {
          name: GetFunction_Tool.name,
          description: GetFunction_Tool.description,
          inputSchema: GetFunction_Tool.inputSchema,
        },
        handler: (args: any) => handleGetFunction(this.context, args),
      },
      {
        toolDefinition: {
          name: GetTableContents_Tool.name,
          description: GetTableContents_Tool.description,
          inputSchema: GetTableContents_Tool.inputSchema,
        },
        handler: (args: any) => handleGetTableContents(this.context, args),
      },
      {
        toolDefinition: {
          name: GetPackageContents_Tool.name,
          description: GetPackageContents_Tool.description,
          inputSchema: GetPackageContents_Tool.inputSchema,
        },
        handler: (args: any) => handleGetPackageContents(this.context, args),
      },
      {
        toolDefinition: {
          name: GetInclude_Tool.name,
          description: GetInclude_Tool.description,
          inputSchema: GetInclude_Tool.inputSchema,
        },
        handler: (args: any) => handleGetInclude(this.context, args),
      },
      {
        toolDefinition: {
          name: GetIncludesList_Tool.name,
          description: GetIncludesList_Tool.description,
          inputSchema: GetIncludesList_Tool.inputSchema,
        },
        handler: (args: any) => handleGetIncludesList(this.context, args),
      },
      {
        toolDefinition: {
          name: GetEnhancements_Tool.name,
          description: GetEnhancements_Tool.description,
          inputSchema: GetEnhancements_Tool.inputSchema,
        },
        handler: (args: any) => handleGetEnhancements(this.context, args),
      },
      {
        toolDefinition: {
          name: GetEnhancementSpot_Tool.name,
          description: GetEnhancementSpot_Tool.description,
          inputSchema: GetEnhancementSpot_Tool.inputSchema,
        },
        handler: (args: any) => handleGetEnhancementSpot(this.context, args),
      },
      {
        toolDefinition: {
          name: GetEnhancementImpl_Tool.name,
          description: GetEnhancementImpl_Tool.description,
          inputSchema: GetEnhancementImpl_Tool.inputSchema,
        },
        handler: (args: any) => handleGetEnhancementImpl(this.context, args),
      },
      {
        toolDefinition: {
          name: GetTransport_Tool.name,
          description: GetTransport_Tool.description,
          inputSchema: GetTransport_Tool.inputSchema,
        },
        handler: (args: any) => handleGetTransport(this.context, args),
      },
      {
        toolDefinition: {
          name: ListTransports_Tool.name,
          description: ListTransports_Tool.description,
          inputSchema: ListTransports_Tool.inputSchema,
        },
        handler: (args: any) => handleListTransports(this.context, args),
      },
      {
        toolDefinition: {
          name: GetProgFullCode_Tool.name,
          description: GetProgFullCode_Tool.description,
          inputSchema: GetProgFullCode_Tool.inputSchema,
        },
        handler: (args: any) => handleGetProgFullCode(this.context, args),
      },
    ];
  }
}
