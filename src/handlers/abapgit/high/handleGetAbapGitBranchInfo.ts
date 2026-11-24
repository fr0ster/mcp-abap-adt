/**
 * GetAbapGitBranchInfo: one remote branch, for the package it would be
 * linked to (R14, cloud). SAP links the repository to the package, reads
 * its settings and removes the link to answer it, so it is a write, outside
 * the read-only sets.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  BRANCH_FIELD,
  PACKAGE_NAME_FIELD,
  URL_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  ABAPGIT_HEADERS,
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedUrl,
} from '../../../lib/abapGit/client';
import {
  ABAPGIT_DETAIL_SHAPE,
  ACCESS_MODE_HEADS,
  BRANCH_INFO_ANSWERS,
  BRANCH_INFO_MEDIUM,
  BRANCH_INFO_TERSE,
} from '../../../lib/abapGit/formats';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import { answerAt, listAnswerAt, shapesOf } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitBranchInfo',
  available_in: ['cloud'] as const,
  description: toolDescription({
    purpose: purpose(
      'Gets the abapGit branch information of a remote repository for the package it would be linked to.',
    ),
    returns: returnsOf({
      heads: ACCESS_MODE_HEADS,
      shapes: [shapesOf(BRANCH_INFO_TERSE)],
    }),
  }),
  inputSchema: z.object({
    url: URL_FIELD,
    branch: BRANCH_FIELD,
    package_name: PACKAGE_NAME_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitBranchInfo(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = listAnswerAt(BRANCH_INFO_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetAbapGitBranchInfo', detail: detailOf(args) },
    async () => {
      const { url, credentials } = admittedUrl(admissionOf(context));
      return abapGitClientOf(context.connection, context.logger).getBranchInfo(
        { url, branch: args.branch, package: args.package_name },
        {
          ...(credentials !== null ? { credentials } : {}),
          headers: ABAPGIT_HEADERS.externalRepo,
          analyse: abapGitVerdict,
        },
      );
    },
    format,
  );
}
