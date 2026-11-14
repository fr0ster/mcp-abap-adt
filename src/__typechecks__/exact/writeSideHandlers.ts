/**
 * The exact-optional pairing typecheck of the write-side directories' handlers (behavior_definition, behavior_implementation, class, data_element, ddl, ddlx, domain) (no-assertions plan, S2a):
 * each handler takes its definition's schema output. Run by `test:check`, under `exactOptionalPropertyTypes` as every
 * project is; never emitted (excluded from the build).
 */

import {
  TOOL_DEFINITION as D0,
  handleCheckBehaviorDefinition as H0,
} from '../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import {
  TOOL_DEFINITION as D1,
  handleCreateBehaviorDefinition as H1,
} from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import {
  TOOL_DEFINITION as D2,
  handleDeleteBehaviorDefinition as H2,
} from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import {
  TOOL_DEFINITION as D3,
  handleUpdateBehaviorDefinition as H3,
} from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import {
  TOOL_DEFINITION as D4,
  handleActivateBehaviorDefinition as H4,
} from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import {
  TOOL_DEFINITION as D5,
  handleCheckBehaviorDefinition as H5,
} from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import {
  TOOL_DEFINITION as D6,
  handleUpdateBehaviorDefinition as H6,
} from '../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import {
  TOOL_DEFINITION as D7,
  handleCreateBehaviorImplementation as H7,
} from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import {
  TOOL_DEFINITION as D8,
  handleDeleteBehaviorImplementation as H8,
} from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import {
  TOOL_DEFINITION as D9,
  handleUpdateBehaviorImplementation as H9,
} from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import {
  TOOL_DEFINITION as D10,
  handleCheckClass as H10,
} from '../../handlers/class/high/handleCheckClass';
import {
  TOOL_DEFINITION as D11,
  handleCreateClass as H11,
} from '../../handlers/class/high/handleCreateClass';
import {
  TOOL_DEFINITION as D12,
  handleDeleteClass as H12,
} from '../../handlers/class/high/handleDeleteClass';
import {
  TOOL_DEFINITION as D13,
  handleDeleteLocalDefinitions as H13,
} from '../../handlers/class/high/handleDeleteLocalDefinitions';
import {
  TOOL_DEFINITION as D14,
  handleDeleteLocalMacros as H14,
} from '../../handlers/class/high/handleDeleteLocalMacros';
import {
  TOOL_DEFINITION as D15,
  handleDeleteLocalTestClass as H15,
} from '../../handlers/class/high/handleDeleteLocalTestClass';
import {
  TOOL_DEFINITION as D16,
  handleDeleteLocalTypes as H16,
} from '../../handlers/class/high/handleDeleteLocalTypes';
import {
  TOOL_DEFINITION as D17,
  handleUpdateClass as H17,
} from '../../handlers/class/high/handleUpdateClass';
import {
  TOOL_DEFINITION as D18,
  handleUpdateLocalDefinitions as H18,
} from '../../handlers/class/high/handleUpdateLocalDefinitions';
import {
  TOOL_DEFINITION as D19,
  handleUpdateLocalMacros as H19,
} from '../../handlers/class/high/handleUpdateLocalMacros';
import {
  TOOL_DEFINITION as D20,
  handleUpdateLocalTestClass as H20,
} from '../../handlers/class/high/handleUpdateLocalTestClass';
import {
  TOOL_DEFINITION as D21,
  handleUpdateLocalTypes as H21,
} from '../../handlers/class/high/handleUpdateLocalTypes';
import {
  TOOL_DEFINITION as D22,
  handleActivateClass as H22,
} from '../../handlers/class/low/handleActivateClass';
import {
  TOOL_DEFINITION as D23,
  handleCheckClass as H23,
} from '../../handlers/class/low/handleCheckClass';
import {
  TOOL_DEFINITION as D24,
  handleUpdateClass as H24,
} from '../../handlers/class/low/handleUpdateClass';
import {
  TOOL_DEFINITION as D25,
  handleCheckDataElement as H25,
} from '../../handlers/data_element/high/handleCheckDataElement';
import {
  TOOL_DEFINITION as D26,
  handleCreateDataElement as H26,
} from '../../handlers/data_element/high/handleCreateDataElement';
import {
  TOOL_DEFINITION as D27,
  handleDeleteDataElement as H27,
} from '../../handlers/data_element/high/handleDeleteDataElement';
import {
  TOOL_DEFINITION as D28,
  handleGetDataElement as H28,
} from '../../handlers/data_element/high/handleGetDataElement';
import {
  TOOL_DEFINITION as D29,
  handleUpdateDataElement as H29,
} from '../../handlers/data_element/high/handleUpdateDataElement';
import {
  TOOL_DEFINITION as D30,
  handleActivateDataElement as H30,
} from '../../handlers/data_element/low/handleActivateDataElement';
import {
  TOOL_DEFINITION as D31,
  handleCheckDataElement as H31,
} from '../../handlers/data_element/low/handleCheckDataElement';
import {
  TOOL_DEFINITION as D32,
  handleUpdateDataElement as H32,
} from '../../handlers/data_element/low/handleUpdateDataElement';
import {
  TOOL_DEFINITION as D33,
  handleCheckDdl as H33,
} from '../../handlers/ddl/high/handleCheckDdl';
import {
  TOOL_DEFINITION as D34,
  handleCreateDdl as H34,
} from '../../handlers/ddl/high/handleCreateDdl';
import {
  TOOL_DEFINITION as D35,
  handleDeleteDdl as H35,
} from '../../handlers/ddl/high/handleDeleteDdl';
import {
  TOOL_DEFINITION as D36,
  handleUpdateDdl as H36,
} from '../../handlers/ddl/high/handleUpdateDdl';
import {
  TOOL_DEFINITION as D37,
  handleActivateDdl as H37,
} from '../../handlers/ddl/low/handleActivateDdl';
import {
  TOOL_DEFINITION as D38,
  handleCheckDdl as H38,
} from '../../handlers/ddl/low/handleCheckDdl';
import {
  TOOL_DEFINITION as D39,
  handleUpdateDdl as H39,
} from '../../handlers/ddl/low/handleUpdateDdl';
import {
  TOOL_DEFINITION as D40,
  handleCheckMetadataExtension as H40,
} from '../../handlers/ddlx/high/handleCheckMetadataExtension';
import {
  TOOL_DEFINITION as D41,
  handleCreateMetadataExtension as H41,
} from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import {
  TOOL_DEFINITION as D42,
  handleUpdateMetadataExtension as H42,
} from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import {
  TOOL_DEFINITION as D43,
  handleActivateMetadataExtension as H43,
} from '../../handlers/ddlx/low/handleActivateMetadataExtension';
import {
  TOOL_DEFINITION as D44,
  handleCheckMetadataExtension as H44,
} from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import {
  TOOL_DEFINITION as D45,
  handleUpdateMetadataExtension as H45,
} from '../../handlers/ddlx/low/handleUpdateMetadataExtension';
import {
  TOOL_DEFINITION as D46,
  handleCheckDomain as H46,
} from '../../handlers/domain/high/handleCheckDomain';
import {
  TOOL_DEFINITION as D47,
  handleCreateDomain as H47,
} from '../../handlers/domain/high/handleCreateDomain';
import {
  TOOL_DEFINITION as D48,
  handleDeleteDomain as H48,
} from '../../handlers/domain/high/handleDeleteDomain';
import {
  TOOL_DEFINITION as D49,
  handleGetDomain as H49,
} from '../../handlers/domain/high/handleGetDomain';
import {
  TOOL_DEFINITION as D50,
  handleUpdateDomain as H50,
} from '../../handlers/domain/high/handleUpdateDomain';
import {
  TOOL_DEFINITION as D51,
  handleActivateDomain as H51,
} from '../../handlers/domain/low/handleActivateDomain';
import {
  TOOL_DEFINITION as D52,
  handleCheckDomain as H52,
} from '../../handlers/domain/low/handleCheckDomain';
import {
  TOOL_DEFINITION as D53,
  handleUpdateDomain as H53,
} from '../../handlers/domain/low/handleUpdateDomain';
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
];
