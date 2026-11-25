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
import { purpose, toolDescription } from '../../../lib/description';
import { listAnswerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitStaging',
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the abapGit staging of a linked repository: what changed, to choose what a push commits.',
    ),
  }),
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitStaging(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = listAnswerAt(STAGING_ANSWERS, levelOf(args));
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
