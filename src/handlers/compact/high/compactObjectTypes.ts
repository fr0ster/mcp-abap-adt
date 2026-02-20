import type { handleCreateClass } from '../../class/high/handleCreateClass';
import type { handleDeleteClass } from '../../class/high/handleDeleteClass';
import type { handleGetClass } from '../../class/high/handleGetClass';
import type { handleUpdateClass } from '../../class/high/handleUpdateClass';
import type { handleCreateDomain } from '../../domain/high/handleCreateDomain';
import type { handleDeleteDomain } from '../../domain/high/handleDeleteDomain';
import type { handleGetDomain } from '../../domain/high/handleGetDomain';
import type { handleUpdateDomain } from '../../domain/high/handleUpdateDomain';
import type { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import type { handleUpdateFunctionModule } from '../../function/high/handleUpdateFunctionModule';
import type { handleDeleteFunctionModule } from '../../function_module/high/handleDeleteFunctionModule';
import type { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';
import type { handleCreateProgram } from '../../program/high/handleCreateProgram';
import type { handleDeleteProgram } from '../../program/high/handleDeleteProgram';
import type { handleGetProgram } from '../../program/high/handleGetProgram';
import type { handleUpdateProgram } from '../../program/high/handleUpdateProgram';

export type CompactObjectType =
  | 'CLASS'
  | 'PROGRAM'
  | 'DOMAIN'
  | 'FUNCTION_MODULE';

export type CompactCreateArgsByType = {
  CLASS: Parameters<typeof handleCreateClass>[1];
  PROGRAM: Parameters<typeof handleCreateProgram>[1];
  DOMAIN: Parameters<typeof handleCreateDomain>[1];
  FUNCTION_MODULE: Parameters<typeof handleCreateFunctionModule>[1];
};

export type CompactGetArgsByType = {
  CLASS: Parameters<typeof handleGetClass>[1];
  PROGRAM: Parameters<typeof handleGetProgram>[1];
  DOMAIN: Parameters<typeof handleGetDomain>[1];
  FUNCTION_MODULE: Parameters<typeof handleGetFunctionModule>[1];
};

export type CompactUpdateArgsByType = {
  CLASS: Parameters<typeof handleUpdateClass>[1];
  PROGRAM: Parameters<typeof handleUpdateProgram>[1];
  DOMAIN: Parameters<typeof handleUpdateDomain>[1];
  FUNCTION_MODULE: Parameters<typeof handleUpdateFunctionModule>[1];
};

export type CompactDeleteArgsByType = {
  CLASS: Parameters<typeof handleDeleteClass>[1];
  PROGRAM: Parameters<typeof handleDeleteProgram>[1];
  DOMAIN: Parameters<typeof handleDeleteDomain>[1];
  FUNCTION_MODULE: Parameters<typeof handleDeleteFunctionModule>[1];
};

export const COMPACT_OBJECT_TYPES: CompactObjectType[] = [
  'CLASS',
  'PROGRAM',
  'DOMAIN',
  'FUNCTION_MODULE',
];
