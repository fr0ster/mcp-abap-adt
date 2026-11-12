/**
 * The exact-optional pairing typecheck of compact-readonly-entries's handlers (no-assertions plan,
 * S2a): each handler takes its definition's schema output, and a definition
 * stated per variant has each variant's output accepted by its handler. Run
 * by `npm run test:check:exact` with `exactOptionalPropertyTypes`, and by
 * `test:check` without it; never emitted (excluded from the package build).
 */
import { defineTool, type HandlerContext } from '@mcp-abap-adt/lib/handlers';
import type * as z from 'zod';
import {
  TOOL_DEFINITION as HandlerCdsUnitTestResult,
  handleHandlerCdsUnitTestResult,
} from '../../handlers/handleHandlerCdsUnitTestResult';
import {
  TOOL_DEFINITION as HandlerCdsUnitTestStatus,
  handleHandlerCdsUnitTestStatus,
} from '../../handlers/handleHandlerCdsUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerCheckRun,
  handleHandlerCheckRun,
} from '../../handlers/handleHandlerCheckRun';
import {
  TOOL_DEFINITION as HandlerDeletionCheck,
  handleHandlerDeletionCheck,
} from '../../handlers/handleHandlerDeletionCheck';
import {
  TOOL_DEFINITION as HandlerDumpList,
  handleHandlerDumpList,
} from '../../handlers/handleHandlerDumpList';
import {
  TOOL_DEFINITION as HandlerDumpView,
  handleHandlerDumpView,
} from '../../handlers/handleHandlerDumpView';
import {
  TOOL_DEFINITION as HandlerGet,
  handleHandlerGet,
} from '../../handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerGetData,
  handleHandlerGetData,
} from '../../handlers/handleHandlerGetData';
import {
  TOOL_DEFINITION as HandlerProfileView,
  handleHandlerProfileView,
} from '../../handlers/handleHandlerProfileView';
import {
  TOOL_DEFINITION as HandlerSearch,
  handleHandlerSearch,
} from '../../handlers/handleHandlerSearch';
import {
  TOOL_DEFINITION as HandlerServiceBindingListTypes,
  handleHandlerServiceBindingListTypes,
} from '../../handlers/handleHandlerServiceBindingListTypes';
import {
  TOOL_DEFINITION as HandlerServiceBindingValidate,
  handleHandlerServiceBindingValidate,
} from '../../handlers/handleHandlerServiceBindingValidate';
import {
  TOOL_DEFINITION as HandlerUnitTestResult,
  handleHandlerUnitTestResult,
} from '../../handlers/handleHandlerUnitTestResult';
import {
  TOOL_DEFINITION as HandlerUnitTestStatus,
  handleHandlerUnitTestStatus,
} from '../../handlers/handleHandlerUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerValidate,
  handleHandlerValidate,
} from '../../handlers/handleHandlerValidate';
import {
  TOOL_DEFINITION as HandlerWhereUsed,
  handleHandlerWhereUsed,
} from '../../handlers/handleHandlerWhereUsed';

/** The arguments `H` takes. */
type ArgsOf<H> = H extends (context: HandlerContext, args: infer A) => unknown
  ? A
  : never;

/** `true` when every output of `S` is an argument `H` takes. */
type Accepts<S extends z.ZodType, H> = [z.output<S>] extends [ArgsOf<H>]
  ? true
  : false;

export const pairings = [
  defineTool(HandlerCheckRun, handleHandlerCheckRun),
  defineTool(HandlerDeletionCheck, handleHandlerDeletionCheck),
  defineTool(HandlerGetData, handleHandlerGetData),
  defineTool(HandlerValidate, handleHandlerValidate),
  defineTool(HandlerWhereUsed, handleHandlerWhereUsed),
  defineTool(HandlerGet, handleHandlerGet),
  defineTool(HandlerCdsUnitTestResult, handleHandlerCdsUnitTestResult),
  defineTool(HandlerCdsUnitTestStatus, handleHandlerCdsUnitTestStatus),
  defineTool(HandlerDumpList, handleHandlerDumpList),
  defineTool(HandlerDumpView, handleHandlerDumpView),
  defineTool(HandlerProfileView, handleHandlerProfileView),
  defineTool(HandlerSearch, handleHandlerSearch),
  defineTool(
    HandlerServiceBindingListTypes,
    handleHandlerServiceBindingListTypes,
  ),
  defineTool(
    HandlerServiceBindingValidate,
    handleHandlerServiceBindingValidate,
  ),
  defineTool(HandlerUnitTestResult, handleHandlerUnitTestResult),
  defineTool(HandlerUnitTestStatus, handleHandlerUnitTestStatus),
];

export const handlerCheckRunOnprem: Accepts<
  (typeof HandlerCheckRun.variants)['onprem']['inputSchema'],
  typeof handleHandlerCheckRun
> = true;

export const handlerCheckRunCloud: Accepts<
  (typeof HandlerCheckRun.variants)['cloud']['inputSchema'],
  typeof handleHandlerCheckRun
> = true;

export const handlerDeletionCheckOnprem: Accepts<
  (typeof HandlerDeletionCheck.variants)['onprem']['inputSchema'],
  typeof handleHandlerDeletionCheck
> = true;

export const handlerDeletionCheckCloud: Accepts<
  (typeof HandlerDeletionCheck.variants)['cloud']['inputSchema'],
  typeof handleHandlerDeletionCheck
> = true;

export const handlerValidateOnprem: Accepts<
  (typeof HandlerValidate.variants)['onprem']['inputSchema'],
  typeof handleHandlerValidate
> = true;

export const handlerValidateCloud: Accepts<
  (typeof HandlerValidate.variants)['cloud']['inputSchema'],
  typeof handleHandlerValidate
> = true;

export const handlerWhereUsedOnprem: Accepts<
  (typeof HandlerWhereUsed.variants)['onprem']['inputSchema'],
  typeof handleHandlerWhereUsed
> = true;

export const handlerWhereUsedCloud: Accepts<
  (typeof HandlerWhereUsed.variants)['cloud']['inputSchema'],
  typeof handleHandlerWhereUsed
> = true;

export const handlerGetOnprem: Accepts<
  (typeof HandlerGet.variants)['onprem']['inputSchema'],
  typeof handleHandlerGet
> = true;

export const handlerGetCloud: Accepts<
  (typeof HandlerGet.variants)['cloud']['inputSchema'],
  typeof handleHandlerGet
> = true;
