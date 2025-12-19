import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

// Import readonly handlers
import { handleGetProgram } from "../../../handlers/program/readonly/handleGetProgram";
import { handleGetClass } from "../../../handlers/class/readonly/handleGetClass";
import { handleGetFunctionGroup } from "../../../handlers/function/readonly/handleGetFunctionGroup";
import { handleGetFunction } from "../../../handlers/function/readonly/handleGetFunction";
import { handleGetTable } from "../../../handlers/table/readonly/handleGetTable";
import { handleGetStructure } from "../../../handlers/structure/readonly/handleGetStructure";
import { handleGetTableContents } from "../../../handlers/table/readonly/handleGetTableContents";
import { handleGetPackage } from "../../../handlers/package/readonly/handleGetPackage";
import { handleGetInclude } from "../../../handlers/include/readonly/handleGetInclude";
import { handleGetIncludesList } from "../../../handlers/include/readonly/handleGetIncludesList";
import { handleGetEnhancements } from "../../../handlers/enhancement/readonly/handleGetEnhancements";
import { handleGetEnhancementSpot } from "../../../handlers/enhancement/readonly/handleGetEnhancementSpot";
import { handleGetEnhancementImpl } from "../../../handlers/enhancement/readonly/handleGetEnhancementImpl";
import { handleGetBdef } from "../../../handlers/behavior_definition/readonly/handleGetBdef";
import { handleGetInterface } from "../../../handlers/interface/readonly/handleGetInterface";
import { handleGetDomain } from "../../../handlers/domain/readonly/handleGetDomain";
import { handleGetDataElement } from "../../../handlers/data_element/readonly/handleGetDataElement";
import { handleGetTransport } from "../../../handlers/transport/readonly/handleGetTransport";
import { handleGetView } from "../../../handlers/view/readonly/handleGetView";
import { handleGetServiceDefinition } from "../../../handlers/service_definition/readonly/handleGetServiceDefinition";
import { handleGetProgFullCode } from "../../../handlers/program/readonly/handleGetProgFullCode";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetProgram_Tool } from "../../../handlers/program/readonly/handleGetProgram";
import { TOOL_DEFINITION as GetClass_Tool } from "../../../handlers/class/readonly/handleGetClass";
import { TOOL_DEFINITION as GetFunction_Tool } from "../../../handlers/function/readonly/handleGetFunction";
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from "../../../handlers/function/readonly/handleGetFunctionGroup";
import { TOOL_DEFINITION as GetTable_Tool } from "../../../handlers/table/readonly/handleGetTable";
import { TOOL_DEFINITION as GetStructure_Tool } from "../../../handlers/structure/readonly/handleGetStructure";
import { TOOL_DEFINITION as GetTableContents_Tool } from "../../../handlers/table/readonly/handleGetTableContents";
import { TOOL_DEFINITION as GetPackage_Tool } from "../../../handlers/package/readonly/handleGetPackage";
import { TOOL_DEFINITION as GetInclude_Tool } from "../../../handlers/include/readonly/handleGetInclude";
import { TOOL_DEFINITION as GetIncludesList_Tool } from "../../../handlers/include/readonly/handleGetIncludesList";
import { TOOL_DEFINITION as GetEnhancements_Tool } from "../../../handlers/enhancement/readonly/handleGetEnhancements";
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from "../../../handlers/enhancement/readonly/handleGetEnhancementSpot";
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from "../../../handlers/enhancement/readonly/handleGetEnhancementImpl";
import { TOOL_DEFINITION as GetBdef_Tool } from "../../../handlers/behavior_definition/readonly/handleGetBdef";
import { TOOL_DEFINITION as GetInterface_Tool } from "../../../handlers/interface/readonly/handleGetInterface";
import { TOOL_DEFINITION as GetDomain_Tool } from "../../../handlers/domain/readonly/handleGetDomain";
import { TOOL_DEFINITION as GetDataElement_Tool } from "../../../handlers/data_element/readonly/handleGetDataElement";
import { TOOL_DEFINITION as GetTransport_Tool } from "../../../handlers/transport/readonly/handleGetTransport";
import { TOOL_DEFINITION as GetView_Tool } from "../../../handlers/view/readonly/handleGetView";
import { TOOL_DEFINITION as GetServiceDefinition_Tool } from "../../../handlers/service_definition/readonly/handleGetServiceDefinition";
import { TOOL_DEFINITION as GetProgFullCode_Tool } from "../../../handlers/program/readonly/handleGetProgFullCode";

/**
 * Handler group for all readonly (read-only) handlers.
 * Contains handlers that only read data without modifying the ABAP system.
 */
export class ReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = "ReadOnlyHandlers";

  /**
   * Gets all readonly handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: GetProgram_Tool.name,
          description: GetProgram_Tool.description,
          inputSchema: GetProgram_Tool.inputSchema,
        },
        handler: (args: any) => handleGetProgram(this.context, args),
      },
      {
        toolDefinition: {
          name: GetClass_Tool.name,
          description: GetClass_Tool.description,
          inputSchema: GetClass_Tool.inputSchema,
        },
        handler: (args: any) => handleGetClass(this.context, args),
      },
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
          name: GetFunctionGroup_Tool.name,
          description: GetFunctionGroup_Tool.description,
          inputSchema: GetFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => handleGetFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: GetTable_Tool.name,
          description: GetTable_Tool.description,
          inputSchema: GetTable_Tool.inputSchema,
        },
        handler: (args: any) => handleGetTable(this.context, args),
      },
      {
        toolDefinition: {
          name: GetStructure_Tool.name,
          description: GetStructure_Tool.description,
          inputSchema: GetStructure_Tool.inputSchema,
        },
        handler: (args: any) => handleGetStructure(this.context, args),
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
          name: GetPackage_Tool.name,
          description: GetPackage_Tool.description,
          inputSchema: GetPackage_Tool.inputSchema,
        },
        handler: (args: any) => handleGetPackage(this.context, args),
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
          name: GetBdef_Tool.name,
          description: GetBdef_Tool.description,
          inputSchema: GetBdef_Tool.inputSchema,
        },
        handler: (args: any) => handleGetBdef(this.context, args),
      },
      {
        toolDefinition: {
          name: GetInterface_Tool.name,
          description: GetInterface_Tool.description,
          inputSchema: GetInterface_Tool.inputSchema,
        },
        handler: (args: any) => handleGetInterface(this.context, args),
      },
      {
        toolDefinition: {
          name: GetDomain_Tool.name,
          description: GetDomain_Tool.description,
          inputSchema: GetDomain_Tool.inputSchema,
        },
        handler: (args: any) => handleGetDomain(this.context, args),
      },
      {
        toolDefinition: {
          name: GetDataElement_Tool.name,
          description: GetDataElement_Tool.description,
          inputSchema: GetDataElement_Tool.inputSchema,
        },
        handler: (args: any) => handleGetDataElement(this.context, args),
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
          name: GetView_Tool.name,
          description: GetView_Tool.description,
          inputSchema: GetView_Tool.inputSchema,
        },
        handler: (args: any) => handleGetView(this.context, args),
      },
      {
        toolDefinition: {
          name: GetServiceDefinition_Tool.name,
          description: GetServiceDefinition_Tool.description,
          inputSchema: GetServiceDefinition_Tool.inputSchema,
        },
        handler: (args: any) => handleGetServiceDefinition(this.context, args),
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
