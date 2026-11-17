/**
 * The access-check strategy (spec §3.2): one interface, given to the server
 * by the host, decides every call-time check at a handler's start — the
 * packages, requests and tables the call's arguments name. Two strategies
 * are shipped (`listedAccessChecks`, `packageTreeAccessChecks`); an embedder
 * may give its own.
 */
import type { AccessRefusalCode } from '../auth/serverRefusal.js';

export type { AccessRefusalCode };

/** One argument the call named, and its value as given (trimmed, upper-cased). */
export interface NamedValue {
  readonly argument: string;
  readonly value: string;
}

/** What the call's arguments say, as given. */
export interface AccessCall {
  readonly tool: string;
  /** The value of the tool's dispatching argument, when it has one. */
  readonly dispatch: string | undefined;
  readonly packages: readonly NamedValue[];
  readonly requests: readonly NamedValue[];
  readonly tables: readonly NamedValue[];
  /** Whether the call creates the package `package_name` under `super_package`. */
  readonly packageCreate: boolean;
}

/** A strategy's verdict on one call. */
export type AccessVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: AccessRefusalCode;
      readonly argument: string;
      readonly value: string;
    };

/**
 * The one means a strategy has to read SAP: the super package of a package,
 * read on the call's own connection, `undefined` at the top of the tree.
 */
export interface IPackageReader {
  superPackageOf(packageName: string): Promise<string | undefined>;
}

/** Decides a call before its handler runs. */
export interface IAccessChecks {
  check(call: AccessCall, sap: IPackageReader): Promise<AccessVerdict>;
}

/** The verdict that lets a call run. */
export const ALLOWED: AccessVerdict = { allowed: true };
