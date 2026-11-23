/**
 * ListAbapGitRepos: the repositories linked in the system, read from R1
 * (`listReposQuiet`: stateless, no credential, no wire log), filtered by
 * `package_name` and `repository_key` over the one answer (spec §9.2 a).
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
} from '../../../lib/abapGit/client';
import {
  ABAPGIT_DETAIL_SHAPE,
  filteredRepos,
  REPOS_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'ListAbapGitRepos',
  description:
    "[read-only] Lists the abapGit repositories linked in the system, optionally only the one of package_name or of repository_key. Answers facts only: each repository's key, package, branch and remote URL, and on cloud its run state — the status of its last pull or push (blank initial, R running, S, W, E or A ended), the status text and the key of its run log.",
  inputSchema: z.object({
    package_name: z
      .string()
      .optional()
      .describe('Only the repository linked to this package.'),
    repository_key: z
      .string()
      .optional()
      .describe('Only the repository with this key.'),
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleListAbapGitRepos(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = answerAt(REPOS_ANSWERS, levelOf(args));
  return answer(
    { tool: 'ListAbapGitRepos', detail: detailOf(args) },
    async () => {
      admissionOf(context);
      return abapGitClientOf(context.connection, context.logger).listReposQuiet(
        { analyse: abapGitVerdict },
      );
    },
    (value) =>
      format({
        status: value.status,
        facts: {
          repos: filteredRepos(value.facts.repos, {
            packageName: args.package_name,
            repositoryKey: args.repository_key,
          }),
        },
      }),
  );
}
