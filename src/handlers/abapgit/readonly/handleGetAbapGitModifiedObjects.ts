/**
 * GetAbapGitModifiedObjects: what a pull of the repository would overwrite
 * (R6, cloud), with the credential bound to the R1 entry's URL.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import { REPOSITORY_KEY_FIELD } from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import {
  ABAPGIT_DETAIL_SHAPE,
  MODIFIED_OBJECTS_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitModifiedObjects',
  available_in: ['cloud'] as const,
  description:
    '[read-only] Reads the objects of the system that a pull of the repository would overwrite: those changed locally, and those held by another package. Answers facts only: each object with its type, name, package, URI and the action SAP names for it.',
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitModifiedObjects(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = answerAt(MODIFIED_OBJECTS_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetAbapGitModifiedObjects', detail: detailOf(args) },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(
        context.connection,
        context.logger,
      ).getModifiedObjects(
        { key: repo.key },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    format,
  );
}
