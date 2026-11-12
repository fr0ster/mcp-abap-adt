/**
 * The exact-optional pairing typecheck of the handlers of service_binding, service_definition, structure, table, table_type, transport, enhancement, atc and common (no-assertions plan, S2a):
 * each handler takes its definition's schema output. Run by
 * `npm run test:check:exact` with `exactOptionalPropertyTypes`, and by
 * `test:check` without it; never emitted (excluded from the build).
 */

import {
  TOOL_DEFINITION as D0,
  handleGetATCFindings as H0,
} from '../../handlers/atc/high/handleGetATCFindings';
import {
  TOOL_DEFINITION as D1,
  handleGetATCResult as H1,
} from '../../handlers/atc/high/handleGetATCResult';
import {
  TOOL_DEFINITION as D2,
  handleGetATCRunStatus as H2,
} from '../../handlers/atc/high/handleGetATCRunStatus';
import {
  TOOL_DEFINITION as D3,
  handleListATCResults as H3,
} from '../../handlers/atc/high/handleListATCResults';
import {
  TOOL_DEFINITION as D4,
  handleRunATC as H4,
} from '../../handlers/atc/high/handleRunATC';
import {
  TOOL_DEFINITION as D5,
  TOOL_DEFINITION as D6,
  handleActivateObject as H5,
  handleActivateObjectOnce as H6,
} from '../../handlers/common/low/handleActivateObject';
import {
  TOOL_DEFINITION as D7,
  handleCheckObject as H7,
} from '../../handlers/common/low/handleCheckObject';
import {
  TOOL_DEFINITION as D8,
  handleLockObject as H8,
} from '../../handlers/common/low/handleLockObject';
import {
  TOOL_DEFINITION as D9,
  handleUnlockObject as H9,
} from '../../handlers/common/low/handleUnlockObject';
import {
  TOOL_DEFINITION as D10,
  handleValidateObject as H10,
} from '../../handlers/common/low/handleValidateObject';
import {
  TOOL_DEFINITION as D11,
  handleGetObjectDraft as H11,
} from '../../handlers/common/readonly/handleGetObjectDraft';
import {
  TOOL_DEFINITION as D12,
  handleGetObjectVersionDiff as H12,
} from '../../handlers/common/readonly/handleGetObjectVersionDiff';
import {
  TOOL_DEFINITION as D13,
  handleGetObjectVersionSource as H13,
} from '../../handlers/common/readonly/handleGetObjectVersionSource';
import {
  TOOL_DEFINITION as D14,
  handleGetObjectVersions as H14,
} from '../../handlers/common/readonly/handleGetObjectVersions';
import {
  TOOL_DEFINITION as D15,
  handleGetEnhancementImpl as H15,
} from '../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import {
  TOOL_DEFINITION as D16,
  handleGetEnhancementSpot as H16,
} from '../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import {
  TOOL_DEFINITION as D17,
  handleGetEnhancements as H17,
} from '../../handlers/enhancement/readonly/handleGetEnhancements';
import {
  TOOL_DEFINITION as D18,
  handleCreateServiceBinding as H18,
} from '../../handlers/service_binding/high/handleCreateServiceBinding';
import {
  TOOL_DEFINITION as D19,
  handleDeleteServiceBinding as H19,
} from '../../handlers/service_binding/high/handleDeleteServiceBinding';
import {
  TOOL_DEFINITION as D20,
  handleGetServiceBinding as H20,
} from '../../handlers/service_binding/high/handleGetServiceBinding';
import {
  TOOL_DEFINITION as D21,
  handleListServiceBindingTypes as H21,
} from '../../handlers/service_binding/high/handleListServiceBindingTypes';
import {
  TOOL_DEFINITION as D22,
  handleUpdateServiceBinding as H22,
} from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import {
  TOOL_DEFINITION as D23,
  handleValidateServiceBinding as H23,
} from '../../handlers/service_binding/high/handleValidateServiceBinding';
import {
  TOOL_DEFINITION as D24,
  handleActivateServiceBinding as H24,
} from '../../handlers/service_binding/low/handleActivateServiceBinding';
import {
  TOOL_DEFINITION as D25,
  handleCreateServiceDefinition as H25,
} from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import {
  TOOL_DEFINITION as D26,
  handleDeleteServiceDefinition as H26,
} from '../../handlers/service_definition/high/handleDeleteServiceDefinition';
import {
  TOOL_DEFINITION as D27,
  handleUpdateServiceDefinition as H27,
} from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import {
  TOOL_DEFINITION as D28,
  handleActivateServiceDefinition as H28,
} from '../../handlers/service_definition/low/handleActivateServiceDefinition';
import {
  TOOL_DEFINITION as D29,
  handleCheckStructure as H29,
} from '../../handlers/structure/high/handleCheckStructure';
import {
  TOOL_DEFINITION as D30,
  handleCreateStructure as H30,
} from '../../handlers/structure/high/handleCreateStructure';
import {
  TOOL_DEFINITION as D31,
  handleDeleteStructure as H31,
} from '../../handlers/structure/high/handleDeleteStructure';
import {
  TOOL_DEFINITION as D32,
  handleUpdateStructure as H32,
} from '../../handlers/structure/high/handleUpdateStructure';
import {
  TOOL_DEFINITION as D33,
  handleActivateStructure as H33,
} from '../../handlers/structure/low/handleActivateStructure';
import {
  TOOL_DEFINITION as D34,
  handleCheckStructure as H34,
} from '../../handlers/structure/low/handleCheckStructure';
import {
  TOOL_DEFINITION as D35,
  handleUpdateStructure as H35,
} from '../../handlers/structure/low/handleUpdateStructure';
import {
  TOOL_DEFINITION as D36,
  handleGetStructuresList as H36,
} from '../../handlers/structure/readonly/handleGetStructuresList';
import {
  TOOL_DEFINITION as D37,
  handleCheckTable as H37,
} from '../../handlers/table/high/handleCheckTable';
import {
  TOOL_DEFINITION as D38,
  handleCreateTable as H38,
} from '../../handlers/table/high/handleCreateTable';
import {
  TOOL_DEFINITION as D39,
  handleDeleteTable as H39,
} from '../../handlers/table/high/handleDeleteTable';
import {
  TOOL_DEFINITION as D40,
  handleUpdateTable as H40,
} from '../../handlers/table/high/handleUpdateTable';
import {
  TOOL_DEFINITION as D41,
  handleActivateTable as H41,
} from '../../handlers/table/low/handleActivateTable';
import {
  TOOL_DEFINITION as D42,
  handleCheckTable as H42,
} from '../../handlers/table/low/handleCheckTable';
import {
  TOOL_DEFINITION as D43,
  handleUpdateTable as H43,
} from '../../handlers/table/low/handleUpdateTable';
import {
  TOOL_DEFINITION as D44,
  handleGetTableContents as H44,
} from '../../handlers/table/readonly/handleGetTableContents';
import {
  TOOL_DEFINITION as D45,
  handleCheckTableType as H45,
} from '../../handlers/table_type/high/handleCheckTableType';
import {
  TOOL_DEFINITION as D46,
  handleCreateTableType as H46,
} from '../../handlers/table_type/high/handleCreateTableType';
import {
  TOOL_DEFINITION as D47,
  handleDeleteTableType as H47,
} from '../../handlers/table_type/high/handleDeleteTableType';
import {
  TOOL_DEFINITION as D48,
  handleGetTableType as H48,
} from '../../handlers/table_type/high/handleGetTableType';
import {
  TOOL_DEFINITION as D49,
  handleUpdateTableType as H49,
} from '../../handlers/table_type/high/handleUpdateTableType';
import {
  TOOL_DEFINITION as D50,
  handleActivateTableType as H50,
} from '../../handlers/table_type/low/handleActivateTableType';
import {
  TOOL_DEFINITION as D51,
  handleCheckTableType as H51,
} from '../../handlers/table_type/low/handleCheckTableType';
import {
  TOOL_DEFINITION as D52,
  handleAddTransportObject as H52,
} from '../../handlers/transport/high/handleAddTransportObject';
import {
  TOOL_DEFINITION as D53,
  handleCreateTransport as H53,
} from '../../handlers/transport/high/handleCreateTransport';
import {
  TOOL_DEFINITION as D54,
  handleCreateTransportTask as H54,
} from '../../handlers/transport/high/handleCreateTransportTask';
import {
  TOOL_DEFINITION as D55,
  handleMoveTransportObjects as H55,
} from '../../handlers/transport/high/handleMoveTransportObjects';
import {
  TOOL_DEFINITION as D56,
  handleRemoveTransportObject as H56,
} from '../../handlers/transport/high/handleRemoveTransportObject';
import {
  TOOL_DEFINITION as D57,
  handleSortAndCompressTransportTask as H57,
} from '../../handlers/transport/high/handleSortAndCompressTransportTask';
import {
  TOOL_DEFINITION as D58,
  handleGetTransport as H58,
} from '../../handlers/transport/readonly/handleGetTransport';
import {
  TOOL_DEFINITION as D59,
  handleListTransports as H59,
} from '../../handlers/transport/readonly/handleListTransports';
import {
  TOOL_DEFINITION as D60,
  handleReadTransportActionLog as H60,
} from '../../handlers/transport/readonly/handleReadTransportActionLog';
import {
  TOOL_DEFINITION as D61,
  handleReadTransportObjects as H61,
} from '../../handlers/transport/readonly/handleReadTransportObjects';
import { defineTool } from '../../lib/handlers/interfaces';

export const pairings = [
  defineTool(D0, H0),
  defineTool(D1, H1),
  defineTool(D2, H2),
  defineTool(D3, H3),
  defineTool(D4, H4),
  defineTool(D5, H5),
  defineTool(D6, H6),
  defineTool(D7, H7),
  defineTool(D8, H8),
  defineTool(D9, H9),
  defineTool(D10, H10),
  defineTool(D11, H11),
  defineTool(D12, H12),
  defineTool(D13, H13),
  defineTool(D14, H14),
  defineTool(D15, H15),
  defineTool(D16, H16),
  defineTool(D17, H17),
  defineTool(D18, H18),
  defineTool(D19, H19),
  defineTool(D20, H20),
  defineTool(D21, H21),
  defineTool(D22, H22),
  defineTool(D23, H23),
  defineTool(D24, H24),
  defineTool(D25, H25),
  defineTool(D26, H26),
  defineTool(D27, H27),
  defineTool(D28, H28),
  defineTool(D29, H29),
  defineTool(D30, H30),
  defineTool(D31, H31),
  defineTool(D32, H32),
  defineTool(D33, H33),
  defineTool(D34, H34),
  defineTool(D35, H35),
  defineTool(D36, H36),
  defineTool(D37, H37),
  defineTool(D38, H38),
  defineTool(D39, H39),
  defineTool(D40, H40),
  defineTool(D41, H41),
  defineTool(D42, H42),
  defineTool(D43, H43),
  defineTool(D44, H44),
  defineTool(D45, H45),
  defineTool(D46, H46),
  defineTool(D47, H47),
  defineTool(D48, H48),
  defineTool(D49, H49),
  defineTool(D50, H50),
  defineTool(D51, H51),
  defineTool(D52, H52),
  defineTool(D53, H53),
  defineTool(D54, H54),
  defineTool(D55, H55),
  defineTool(D56, H56),
  defineTool(D57, H57),
  defineTool(D58, H58),
  defineTool(D59, H59),
  defineTool(D60, H60),
  defineTool(D61, H61),
];
