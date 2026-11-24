/**
 * The descriptions of the uniform tool kinds (plan step 10.6): a create,
 * update, delete, check, activate or validate tool states its function in
 * its name — an action and an object type — so its purpose is built from
 * the action, the object and what the inputs add for that object. A check,
 * activation or validation states its facts from the kind's result type
 * (`results.ts`); a create, update or delete states none: its answer is
 * whether SAP took the change, which tells nothing of the tool's function
 * (owner, after the query measurement). A tool whose function differs from
 * its kind's sentence gives its own purpose.
 */

import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import { ACTIVATED, CHECKED, VALIDATED } from './results';
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
  /** The answer, when it is not the kind's own (a check that names its object, say). */
  readonly result?: ResultShape | undefined;
  readonly tag?: DescriptionTag | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/**
 * A create, update or delete: what it acts on, what it writes for that
 * object, and whether the write is recorded in the transport the caller
 * names. Its answer is the kind's, stated nowhere.
 */
export interface WriteTool {
  /** The object written, with its article: `an ABAP domain`. */
  readonly object?: string | undefined;
  /**
   * What the tool writes for that object, and where: `in a package, with
   * its data type, length and fixed values`; one starting with a comma
   * follows the object directly.
   */
  readonly how?: string | undefined;
  /** The sentence ends `, recorded in the transport given`. */
  readonly transported?: true | undefined;
  /** The tool's own purpose, when its function differs from the kind's sentence. */
  readonly purpose?: Purpose | undefined;
  readonly tag?: DescriptionTag | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** The transport a write is recorded in, at its sentence's end. */
const TRANSPORTED = ', recorded in the transport given';

/** `verb object how[, recorded in the transport given].` — the kind's purpose sentence. */
function sentenceOf(
  verb: string,
  tool: Pick<WriteTool, 'object' | 'how' | 'transported'>,
): Purpose {
  const how =
    tool.how === undefined
      ? ''
      : tool.how.startsWith(',') || tool.how.startsWith(':')
        ? tool.how
        : ` ${tool.how}`;
  const transport = tool.transported === true ? TRANSPORTED : '';
  return purpose(`${verb} ${tool.object ?? ''}${how}${transport}.`);
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

/** A write's description: its purpose alone (the tool's own, or the kind's sentence). */
function write(verb: string, tool: WriteTool): string {
  return toolDescription({
    tag: tool.tag,
    purpose: tool.purpose ?? sentenceOf(verb, tool),
    returns: [],
    notes: tool.notes,
  });
}

/** A create: `Creates <object> <how>[, recorded in the transport given].` */
export function createTool(tool: WriteTool): string {
  return write('Creates', tool);
}

/** An update: `Updates <object> <how>[, recorded in the transport given].` */
export function updateTool(tool: WriteTool): string {
  return write('Updates', tool);
}

/** A delete: `Deletes <object> <how>[, recorded in the transport given].` */
export function deleteTool(tool: WriteTool): string {
  return write('Deletes', tool);
}

/** A check: `Checks the syntax of <object> <how>.`, then the check's verdict and messages. */
export function checkTool(tool: KindTool): string {
  return kind('Checks the syntax of', CHECKED, tool);
}

/** An activation: `Activates <object> <how>.`, then the activation's verdict and messages. */
export function activateTool(tool: KindTool): string {
  return kind('Activates', ACTIVATED, tool);
}

/** A validation: `Validates <object> <how>.`, then the verdict and SAP's message. */
export function validateTool(tool: KindTool): string {
  return kind('Validates', VALIDATED, tool);
}
