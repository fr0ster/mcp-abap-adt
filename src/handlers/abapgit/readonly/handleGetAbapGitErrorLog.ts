/**
 * GetAbapGitErrorLog: the log of a repository's run (R8, cloud), by the
 * repository's key and the run log key the admission paired with the R1
 * entry's `log_link` — never a URL.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  APP_LOG_KEY_FIELD,
  REPOSITORY_KEY_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
} from '../../../lib/abapGit/client';
import {
  ABAPGIT_DETAIL_SHAPE,
  RUN_LOG_ANSWERS,
} from '../../../lib/abapGit/formats';
import { purpose, toolDescription } from '../../../lib/description';
import { listAnswerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitErrorLog',
  available_in: ['cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the error log of the last abapGit pull or push of a repository, object by object.',
    ),
  }),
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    app_log_key: APP_LOG_KEY_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitErrorLog(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = listAnswerAt(RUN_LOG_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetAbapGitErrorLog', detail: detailOf(args) },
    async () => {
      const repo = admittedRepo(admissionOf(context));
      return abapGitClientOf(context.connection, context.logger).getRunLog(
        {
          key: repo.key,
          appLogKey: args.app_log_key,
        },
        { analyse: abapGitVerdict },
      );
    },
    format,
  );
}
