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
  REPOS_MEDIUM,
  REPOS_TERSE,
} from '../../../lib/abapGit/formats';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import { answerAt, listAnswerAt, shapesOf } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'ListAbapGitRepos',
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the abapGit repositories linked in the system, or the one with a key or of one package.',
    ),
    returns: returnsOf({
      heads: [],
      shapes: [shapesOf(REPOS_TERSE)],
    }),
  }),
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
  const format = listAnswerAt(REPOS_ANSWERS, levelOf(args));
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
