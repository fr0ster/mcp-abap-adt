/**
 * SwitchAbapGitBranch: switch the repository's branch, or create it in the
 * remote (R15, onprem), with the credential bound to the R1 entry's URL.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  BRANCH_FIELD,
  CREATE_FIELD,
  REPOSITORY_KEY_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import { statusAnswer } from '../../../lib/abapGit/formats';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: 'SwitchAbapGitBranch',
  available_in: ['onprem'] as const,
  description: toolDescription(
    runParts({
      purpose: purpose(
        'Switches an abapGit repository to a branch, creating the branch in the remote first when asked.',
      ),
    }),
  ),
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    branch: BRANCH_FIELD,
    create: CREATE_FIELD,
  }),
} as const;

export async function handleSwitchAbapGitBranch(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answer(
    { tool: 'SwitchAbapGitBranch', detail: 'terse' },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).switchBranch(
        { key: repo.key, branch: args.branch, create: args.create },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    statusAnswer,
  );
}
