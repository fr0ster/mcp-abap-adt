/**
 * The descriptions of the uniform tool kinds (plan step 10.6): a create,
 * update, delete, check, activate or validate tool states its function in
 * its name — an action and an object type — so its purpose is built from
 * the action, the object and what the inputs add, and its facts from the
 * kind's result type (`results.ts`). A tool whose function differs from its
 * kind's sentence gives its own purpose, its facts still the kind's.
 */

import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import { DELETED, WRITTEN, WRITTEN_UNDER_LOCK } from './results';
import { type ResultShape, resultReturns } from './returns';
import { type DescriptionTag, toolDescription } from './toolDescription';

/** A tool of a kind: what it acts on, and what its inputs add. */
export interface KindTool {
  /** The object acted on, with its article: `an ABAP class`. */
  readonly object?: string | undefined;
  /**
   * What the inputs add, after the object: `in a package, with its
   * description`; one starting with a comma follows the object directly.
   */
  readonly how?: string | undefined;
  /** The tool's own purpose, when its function differs from the kind's sentence. */
  readonly purpose?: Purpose | undefined;
  /** The answer, when it is not the kind's own (a delete that writes, say). */
  readonly result?: ResultShape | undefined;
  readonly tag?: DescriptionTag | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** `verb object how.` — the kind's purpose sentence. */
function sentenceOf(verb: string, tool: KindTool): Purpose {
  const how =
    tool.how === undefined
      ? ''
      : tool.how.startsWith(',')
        ? tool.how
        : ` ${tool.how}`;
  return purpose(`${verb} ${tool.object ?? ''}${how}.`);
}

/** A kind's description: its purpose (the tool's own, or the kind's sentence), the kind's facts. */
function kind(verb: string, result: ResultShape, tool: KindTool): string {
  return toolDescription({
    tag: tool.tag,
    purpose: tool.purpose ?? sentenceOf(verb, tool),
    returns: resultReturns(tool.result ?? result),
    notes: tool.notes,
  });
}

/** A create: `Creates <object> <how>.`, then whether SAP took it. */
export function createTool(tool: KindTool): string {
  return kind('Creates', WRITTEN, tool);
}

/** An update: `Updates <object> <how>.`, then whether SAP took it and a lock left held. */
export function updateTool(tool: KindTool): string {
  return kind('Updates', WRITTEN_UNDER_LOCK, tool);
}

/** A delete: `Deletes <object> <how>.`, then SAP's deletion verdict. */
export function deleteTool(tool: KindTool): string {
  return kind('Deletes', DELETED, tool);
}

/**
 * A check, an activation or a validation: its function alone, one sentence
 * (owner, after the query measurement: the verdict and its messages, the
 * same on every such tool, diluted each tool's function).
 */
function verdictless(verb: string, tool: VerdictTool): string {
  return toolDescription({
    tag: tool.tag,
    purpose: tool.purpose ?? sentenceOf(verb, tool),
    returns: [],
    notes: tool.notes,
  });
}

/** A check, an activation or a validation: what it acts on, and what its inputs add. */
export type VerdictTool = Omit<KindTool, 'result'>;

/** A check: `Checks the syntax of <object> <how>.` */
export function checkTool(tool: VerdictTool): string {
  return verdictless('Checks the syntax of', tool);
}

/** An activation: `Activates <object> <how>.` */
export function activateTool(tool: VerdictTool): string {
  return verdictless('Activates', tool);
}

/** A validation: `Validates <object> <how>.` */
export function validateTool(tool: VerdictTool): string {
  return verdictless('Validates', tool);
}
