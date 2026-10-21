/**
 * The removal chain's contracts, checked by the compiler:
 * `npm run test:check` compiles this file, and each `@ts-expect-error` below
 * fails the check the moment its field exists again. interfaces-adt-connection
 * 3.0.0 has no `IAbapRequestOptions.signal`; interfaces-adt 16.0.0 has no
 * `IAdtClientOptions.signal` and no `IAdtError.refusal`. The 2.1 / 15.x
 * releases carried all three, so against them this file does not compile.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import type {
  IAdtClientOptions,
  IAdtError,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

// @ts-expect-error interfaces-adt-connection 3 has no IAbapRequestOptions.signal
type RequestSignal = IAbapRequestOptions['signal'];
// @ts-expect-error interfaces-adt 16 has no IAdtClientOptions.signal
type ClientSignal = IAdtClientOptions['signal'];
// @ts-expect-error interfaces-adt 16 has no IAdtError.refusal
type ErrorRefusal = IAdtError['refusal'];

export type ChainContracts = [RequestSignal, ClientSignal, ErrorRefusal];
