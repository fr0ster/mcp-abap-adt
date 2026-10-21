/**
 * Where a header-taking call runs (`withAdtHeaders`): inside an internal
 * batch phase (`runPhase`), whose parts the phase corrects; inside a call
 * recorded in batch mode, which is made once; or neither. Scoped to the
 * call's async work; it holds nothing beyond it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { AdtHeaderPort } from './AdtHeaderPairs';
import type { AdtOperation } from './defaultPairs';

/** One `withAdtHeaders` call inside a phase: what the phase needs to record it again. */
export interface HeaderInvocation {
  readonly operation: AdtOperation;
  /** The pair the call was made with. */
  readonly sent: IAdtHeaders;
  readonly port: AdtHeaderPort | undefined;
  /** The same member call, with another pair. */
  readonly call: (headers: IAdtHeaders) => Promise<unknown>;
  /** How many parts the call recorded in the phase. */
  parts: number;
  /** The call made again with the corrected pair, once the phase made it. */
  redone: Promise<unknown> | undefined;
}

export interface AdtCallScope {
  /** Inside a call recorded in batch mode: the call is made once. */
  readonly recorded?: true;
  /** Inside a read of an internal batch phase: the phase's identity. */
  readonly phase?: object;
  /** The `withAdtHeaders` call the read is making. */
  readonly invocation?: HeaderInvocation;
  /** A call the phase records again: its requests go to the correction envelope. */
  readonly correcting?: {
    readonly phase: object;
    record(request: IAbapRequestOptions): Promise<IAdtWireResponse>;
  };
}

export const adtCallScope = new AsyncLocalStorage<AdtCallScope>();

/** Runs `fn` as a call recorded in batch mode: its header-taking calls are made once. */
export function asRecordedCall<T>(fn: () => T): T {
  return adtCallScope.run({ recorded: true }, fn);
}
