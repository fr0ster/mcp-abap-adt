/**
 * CheckAbapGitExternalRepo: what a remote repository offers before it is
 * linked (R13, the new form of `checkExternalRepo`), sent to the URL the
 * admission bound — the configured URL when an alias matched — with its
 * credential, or anonymously (`credentials: null`).
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import { URL_FIELD } from '../../../lib/abapGit/arguments';
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
  EXTERNAL_REPO_ANSWERS,
  EXTERNAL_REPO_MEDIUM,
  EXTERNAL_REPO_TERSE,
} from '../../../lib/abapGit/formats';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import { answerAt, listAnswerAt, shapesOf } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'CheckAbapGitExternalRepo',
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Checks an external git repository for abapGit before it is linked: its access and its branches.',
    ),
    returns: returnsOf({
      heads: ACCESS_MODE_HEADS,
      shapes: [shapesOf(EXTERNAL_REPO_TERSE)],
    }),
  }),
  inputSchema: z.object({ url: URL_FIELD, ...ABAPGIT_DETAIL_SHAPE }),
} as const;

export async function handleCheckAbapGitExternalRepo(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = listAnswerAt(EXTERNAL_REPO_ANSWERS, levelOf(args));
  return answer(
    { tool: 'CheckAbapGitExternalRepo', detail: detailOf(args) },
    async () => {
      const { url, credentials } = admittedUrl(admissionOf(context));
      return abapGitClientOf(
        context.connection,
        context.logger,
      ).checkExternalRepo(
        { url },
        {
          headers: ABAPGIT_HEADERS.externalRepo,
          credentials,
          analyse: abapGitVerdict,
        },
      );
    },
    format,
  );
}
