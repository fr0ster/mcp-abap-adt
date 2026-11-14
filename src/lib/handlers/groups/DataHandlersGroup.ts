import {
  TOOL_DEFINITION as GetSqlQuery_Tool,
  handleGetSqlQuery,
} from '../../../handlers/system/readonly/handleGetSqlQuery';
import {
  TOOL_DEFINITION as GetTableContents_Tool,
  handleGetTableContents,
} from '../../../handlers/table/readonly/handleGetTableContents';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import { defineTool, type HandlerEntry } from '../interfaces.js';

/**
 * The data tools: the reads of business data through ADT's data preview —
 * `GetSqlQuery` (a freestyle `SELECT`) and `GetTableContents` (a table's or
 * CDS view's rows).
 *
 * **Opt-in.** No set serves this group unless it is asked to: a binary only
 * with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`),
 * an embedder only by stating it (`exposition: [..., 'data']`,
 * `HandlerExporter`'s `includeData: true`, or this group itself). SAP API
 * Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for
 * reading application tables, exporting business data or running SQL against
 * SAP systems; whether to serve these tools is the customer's decision. The
 * compact sets' form of them is `CompactDataHandlersGroup`
 * (`@mcp-abap-adt/compact-readonly-entries`).
 */
export class DataHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DataHandlers';

  getHandlers(): HandlerEntry[] {
    return [
      defineTool(GetTableContents_Tool, handleGetTableContents),
      defineTool(GetSqlQuery_Tool, handleGetSqlQuery),
    ];
  }
}
