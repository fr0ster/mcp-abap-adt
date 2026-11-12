/**
 * The exact-optional pairing typecheck of compact-modify's handlers (no-assertions plan,
 * S2a): each handler takes its definition's schema output, and a definition
 * stated per variant has each variant's output accepted by its handler. Run
 * by `npm run test:check:exact` with `exactOptionalPropertyTypes`, and by
 * `test:check` without it; never emitted (excluded from the package build).
 */
import { defineTool, type HandlerContext } from '@mcp-abap-adt/lib/handlers';
import type * as z from 'zod';
import {
  TOOL_DEFINITION as HandlerActivate,
  handleHandlerActivate,
} from '../../handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as HandlerCreate,
  handleHandlerCreate,
} from '../../handlers/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerDelete,
  handleHandlerDelete,
} from '../../handlers/handleHandlerDelete';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../../handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerProfileRun,
  handleHandlerProfileRun,
} from '../../handlers/handleHandlerProfileRun';
import {
  TOOL_DEFINITION as HandlerTransportCreate,
  handleHandlerTransportCreate,
} from '../../handlers/handleHandlerTransportCreate';
import {
  TOOL_DEFINITION as HandlerTransportMoveObjects,
  handleHandlerTransportMoveObjects,
} from '../../handlers/handleHandlerTransportMoveObjects';
import {
  TOOL_DEFINITION as HandlerTransportSortAndCompress,
  handleHandlerTransportSortAndCompress,
} from '../../handlers/handleHandlerTransportSortAndCompress';
import {
  TOOL_DEFINITION as HandlerUnitTestRun,
  handleHandlerUnitTestRun,
} from '../../handlers/handleHandlerUnitTestRun';
import {
  TOOL_DEFINITION as HandlerUnlock,
  handleHandlerUnlock,
} from '../../handlers/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate,
  handleHandlerUpdate,
} from '../../handlers/handleHandlerUpdate';

/** The arguments `H` takes. */
type ArgsOf<H> = H extends (context: HandlerContext, args: infer A) => unknown
  ? A
  : never;

/** `true` when every output of `S` is an argument `H` takes. */
type Accepts<S extends z.ZodType, H> = [z.output<S>] extends [ArgsOf<H>]
  ? true
  : false;

export const pairings = [
  defineTool(HandlerActivate, handleHandlerActivate),
  defineTool(HandlerCreate, handleHandlerCreate),
  defineTool(HandlerDelete, handleHandlerDelete),
  defineTool(HandlerLock, handleHandlerLock),
  defineTool(HandlerUnlock, handleHandlerUnlock),
  defineTool(HandlerProfileRun, handleHandlerProfileRun),
  defineTool(HandlerUpdate, handleHandlerUpdate),
  defineTool(HandlerTransportCreate, handleHandlerTransportCreate),
  defineTool(HandlerTransportMoveObjects, handleHandlerTransportMoveObjects),
  defineTool(
    HandlerTransportSortAndCompress,
    handleHandlerTransportSortAndCompress,
  ),
  defineTool(HandlerUnitTestRun, handleHandlerUnitTestRun),
];

export const handlerActivateOnprem: Accepts<
  (typeof HandlerActivate.variants)['onprem']['inputSchema'],
  typeof handleHandlerActivate
> = true;

export const handlerActivateCloud: Accepts<
  (typeof HandlerActivate.variants)['cloud']['inputSchema'],
  typeof handleHandlerActivate
> = true;

export const handlerCreateOnprem: Accepts<
  (typeof HandlerCreate.variants)['onprem']['inputSchema'],
  typeof handleHandlerCreate
> = true;

export const handlerCreateCloud: Accepts<
  (typeof HandlerCreate.variants)['cloud']['inputSchema'],
  typeof handleHandlerCreate
> = true;

export const handlerDeleteOnprem: Accepts<
  (typeof HandlerDelete.variants)['onprem']['inputSchema'],
  typeof handleHandlerDelete
> = true;

export const handlerDeleteCloud: Accepts<
  (typeof HandlerDelete.variants)['cloud']['inputSchema'],
  typeof handleHandlerDelete
> = true;

export const handlerLockOnprem: Accepts<
  (typeof HandlerLock.variants)['onprem']['inputSchema'],
  typeof handleHandlerLock
> = true;

export const handlerLockCloud: Accepts<
  (typeof HandlerLock.variants)['cloud']['inputSchema'],
  typeof handleHandlerLock
> = true;

export const handlerUnlockOnprem: Accepts<
  (typeof HandlerUnlock.variants)['onprem']['inputSchema'],
  typeof handleHandlerUnlock
> = true;

export const handlerUnlockCloud: Accepts<
  (typeof HandlerUnlock.variants)['cloud']['inputSchema'],
  typeof handleHandlerUnlock
> = true;

export const handlerProfileRunOnprem: Accepts<
  (typeof HandlerProfileRun.variants)['onprem']['inputSchema'],
  typeof handleHandlerProfileRun
> = true;

export const handlerProfileRunCloud: Accepts<
  (typeof HandlerProfileRun.variants)['cloud']['inputSchema'],
  typeof handleHandlerProfileRun
> = true;

export const handlerUpdateOnprem: Accepts<
  (typeof HandlerUpdate.variants)['onprem']['inputSchema'],
  typeof handleHandlerUpdate
> = true;

export const handlerUpdateCloud: Accepts<
  (typeof HandlerUpdate.variants)['cloud']['inputSchema'],
  typeof handleHandlerUpdate
> = true;
