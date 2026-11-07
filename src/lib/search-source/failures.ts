/**
 * What a `SearchSource` call could not read, beside what it read: the
 * answer's `failures`, two kinds of entry.
 *
 * - `SourceFailure`: one source of one scanned object — the object, the
 *   source (its name and URI), the read that failed, SAP's T100 key where SAP
 *   gave one, and the failure as it came (`error`).
 * - `OperationFailure`: a step of the scan that names no object — a package
 *   mask's resolution, a package's walk — with SAP's key where there is one.
 *
 * A credential failure is every request's: it is never an entry, it ends the
 * call as it came.
 */
import { readAdtRefusal } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import {
  type FailureEntry,
  failureEntry,
  isCredentialFailure,
  thrownEntry,
} from '../answer';
import type { T100Key } from '../messageKeys';
import type { FailedLevel } from '../strategies/packageWalk';
import { methodFailureOf } from '../strategies/step';
import type { ScanObjectType } from './packageEnumerator';

/** A source of a scanned object: its name and its ADT URI. */
export interface SourceIdentity {
  name: string;
  uri: string;
}

/** A source of a scanned object that was not read. */
export interface SourceFailure {
  kind: 'source';
  devclass: string;
  object_type: ScanObjectType;
  object_name: string;
  source: SourceIdentity;
  /** The read that failed. */
  step: string;
  /** SAP's T100 key (message class and number), where SAP gave one. */
  t100?: T100Key;
  error: FailureEntry;
}

/** The steps of a scan that name no object. */
export type OperationStep = 'resolve package mask' | 'walk package';

/** A step of the scan that failed: no object identity. */
export interface OperationFailure {
  kind: 'operation';
  step: OperationStep;
  /** The package mask whose resolution failed. */
  mask?: string;
  /** The package whose walk failed: the one the call asked for. */
  package?: string;
  /** The level of that walk SAP refused: its package (a subpackage, or the package itself) and, for a type node, the node. */
  failed_level?: FailedLevel;
  /** SAP's T100 key (message class and number), where SAP gave one. */
  t100?: T100Key;
  error: FailureEntry;
}

export type ScanFailure = SourceFailure | OperationFailure;

/**
 * SAP's T100 key of a failed answer: the first message carrying one, read
 * from SAP's document by the refusal reader. `undefined` where SAP gave none.
 */
export function t100Of(error: IAdtError): T100Key | undefined {
  const refusal = readAdtRefusal(error.response?.data);
  const keyed = refusal?.messages.find((m) => m.t100 !== undefined)?.t100;
  return keyed === undefined ? undefined : { id: keyed.id, no: keyed.no };
}

/** What a failure says, for an entry: the error entry and SAP's key. */
export interface FailureFacts {
  error: FailureEntry;
  t100?: T100Key;
}

/** The facts of a failed answer SAP gave (`ok: false`). */
export function answeredFacts(error: IAdtError, step: string): FailureFacts {
  const t100 = t100Of(error);
  return {
    error: failureEntry(error, step),
    ...(t100 !== undefined ? { t100 } : {}),
  };
}

/**
 * The facts of a thrown failure; a credential failure is rethrown as it
 * came — it ends the call.
 */
export function thrownFacts(thrown: unknown, step: string): FailureFacts {
  if (isCredentialFailure(thrown)) throw thrown;
  const carried = methodFailureOf(thrown);
  const t100 = carried === undefined ? undefined : t100Of(carried);
  return {
    error: thrownEntry(thrown, step),
    ...(t100 !== undefined ? { t100 } : {}),
  };
}

/** Failures in answer order: the operations as they arose, then the sources by package and object. */
export function orderedFailures(
  failures: readonly ScanFailure[],
): ScanFailure[] {
  const operations = failures.filter((f) => f.kind === 'operation');
  const sources = failures
    .filter((f): f is SourceFailure => f.kind === 'source')
    .sort((a, b) => {
      if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
      if (a.object_name !== b.object_name)
        return a.object_name < b.object_name ? -1 : 1;
      return 0;
    });
  return [...operations, ...sources];
}
