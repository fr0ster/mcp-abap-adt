/**
 * GetAbapGitStaging: what changed between the system and the remote branch
 * (R9), with the credential bound to the R1 entry's URL.
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
  STAGING_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitStaging',
  description:
    '[read-only] Reads what changed between the system and the remote branch of the repository, to choose what a push commits. Answers facts only: the unstaged, staged and ignored objects, each with its files and their local and remote state, and the author and committer this system proposes. With detail "medium" every field of the objects a push takes is listed.',
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitStaging(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = answerAt(STAGING_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetAbapGitStaging', detail: detailOf(args) },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).getStaging(
        { key: repo.key },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    format,
  );
}
