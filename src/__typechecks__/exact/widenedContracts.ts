/**
 * The exact-optional typecheck of the server's exported contracts whose
 * optional fields a caller fills from a possibly absent value (no-assertions
 * plan, S2c; spec §8): each such field takes `undefined` under
 * `exactOptionalPropertyTypes`. Run by `test:check`, under `exactOptionalPropertyTypes` as every
 * project is; never emitted (excluded from the
 * build).
 */

import type { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { HandlerContext } from '../../handlers/interfaces';
import type { BatchAnswer } from '../../lib/batch/InstanceBatch';
import type { AmdpSession } from '../../lib/debugger/AmdpSession';
import type {
  DebugStartOptions,
  StopView,
} from '../../lib/debugger/DebugSession';
import type { BreakpointTarget } from '../../lib/debugger/objectUri';
import type { PlaceReading } from '../../lib/debugger/readings';
import type { HandlerExporterOptions } from '../../lib/handlers/HandlerExporter';
import type { RequestContext } from '../../lib/requestContext';
import type { ResolvedSystemContext } from '../../lib/requestSystemResolution';
import type { InstanceStateOptions } from '../../lib/state/InstanceState';
import type { IAdtSystemContext } from '../../lib/systemContext';
import type { AuthDisplayConfig } from '../../lib/utils';

declare const context: HandlerContext;
export const handlerContext: HandlerContext = {
  ...context,
  logger: undefined,
};

declare const answer: BatchAnswer;
export const batchAnswer: BatchAnswer = { ...answer, raw: undefined };

declare const exporter: HandlerExporterOptions;
export const exporterOptions: HandlerExporterOptions = {
  ...exporter,
  logger: undefined,
};

declare const target: BreakpointTarget;
export const breakpointTarget: BreakpointTarget = {
  ...target,
  include: undefined,
  parent_name: undefined,
};

declare const stop: StopView;
export const stopView: StopView = {
  ...stop,
  stackError: undefined,
  settings: undefined,
  settingsError: undefined,
};

declare const start: DebugStartOptions;
export const debugStart: DebugStartOptions = { ...start, run: undefined };

type AmdpStart = Parameters<AmdpSession['start']>[0];
declare const amdpStart: AmdpStart;
export const amdpStartOptions: AmdpStart = { ...amdpStart, run: undefined };

declare const place: PlaceReading;
export const placeReading: PlaceReading = { ...place, address: undefined };

export const systemContext: IAdtSystemContext = {
  masterSystem: undefined,
  responsible: undefined,
  masterLanguage: undefined,
};

export const requestContext: RequestContext = {
  masterLanguage: undefined,
  responsible: undefined,
  login: undefined,
  masterSystem: undefined,
};

export const resolved: ResolvedSystemContext = {
  responsible: undefined,
  masterSystem: undefined,
};

declare const state: InstanceStateOptions;
export const stateOptions: InstanceStateOptions = {
  ...state,
  idleMinutes: undefined,
};

export const authDisplay: AuthDisplayConfig = {
  sapClient: undefined,
  username: undefined,
  password: undefined,
  jwtToken: undefined,
};

type ServerOptions = ConstructorParameters<typeof BaseMcpServer>[0];
declare const server: ServerOptions;
export const serverOptions: ServerOptions = {
  ...server,
  systemType: undefined,
  stateIdleMinutes: undefined,
};
