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
  BRANCH_INFO_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitBranchInfo',
  available_in: ['cloud'] as const,
  description:
    "Reads one branch of the remote repository at url for the package it would be linked to: to answer it, SAP links the repository to package_name, reads the repository's settings and removes the link again. Answers facts only: the access mode and the branch with its name, type, whether it is the head, its commit hash and its folder logic.",
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
  const format = answerAt(BRANCH_INFO_ANSWERS, levelOf(args));
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
