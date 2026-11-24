/**
 * CheckAbapGitRepo: the repository's connection to its remote (R11), with
 * the credential bound to the R1 entry's URL.
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
import { statusAnswer } from '../../../lib/abapGit/formats';
import { checkTool, purpose, results } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: 'CheckAbapGitRepo',
  description: checkTool({
    tag: 'read-only',
    purpose: purpose(
      "Checks that the system reaches an abapGit repository's remote and is let in.",
    ),
    result: results.ABAPGIT_STATUS,
  }),
  inputSchema: z.object({ repository_key: REPOSITORY_KEY_FIELD }),
} as const;

export async function handleCheckAbapGitRepo(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answer(
    { tool: 'CheckAbapGitRepo', detail: 'terse' },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).checkRepo(
        { key: repo.key },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    statusAnswer,
  );
}
