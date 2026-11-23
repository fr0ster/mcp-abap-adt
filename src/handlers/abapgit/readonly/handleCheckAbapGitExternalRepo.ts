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
  EXTERNAL_REPO_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'CheckAbapGitExternalRepo',
  description:
    '[read-only] Reads what the remote repository at url offers before it is linked, as the system reaches it. Answers facts only: its access mode (public or private) and its branches, each with its name, type, whether it is the head and its commit hash.',
  inputSchema: z.object({ url: URL_FIELD, ...ABAPGIT_DETAIL_SHAPE }),
} as const;

export async function handleCheckAbapGitExternalRepo(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = answerAt(EXTERNAL_REPO_ANSWERS, levelOf(args));
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
