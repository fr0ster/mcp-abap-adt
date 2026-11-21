/**
 * The prompts a server lists: each prompt built from the source, in the
 * order of the operations (spec §2.1), those serving nothing left out.
 */
import {
  activatePrompt,
  checkPrompt,
  createPrompt,
  deletePrompt,
  getPrompt,
} from './objectPrompts.js';
import type { AbapPrompt, PromptSource } from './types.js';
import { unitTestPrompt } from './unitTestPrompt.js';
import { updatePrompt } from './updatePrompt.js';
import { whereUsedPrompt } from './whereUsedPrompt.js';

/** The prompts `source` serves, in the order of the operations. */
export function abapPrompts(source: PromptSource): readonly AbapPrompt[] {
  return [
    createPrompt,
    getPrompt,
    updatePrompt,
    deletePrompt,
    activatePrompt,
    checkPrompt,
    unitTestPrompt,
    whereUsedPrompt,
  ]
    .map((prompt) => prompt(source))
    .filter((prompt) => prompt !== undefined);
}
