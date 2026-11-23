/**
 * UnlinkAbapGitRepo: remove a repository's link (R3), by the key the
 * admission read from R1 — the existing `unlink` member and the ordinary
 * ADT answer, as the owner ruled.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { REPOSITORY_KEY_FIELD } from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  admissionOf,
  admittedRepo,
} from '../../../lib/abapGit/client';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: 'UnlinkAbapGitRepo',
  description:
    "Removes the link of the repository repository_key from its package; the package's objects stay in the system, and the remote stays as it is. Answers SAP's status.",
  inputSchema: z.object({ repository_key: REPOSITORY_KEY_FIELD }),
} as const;

export async function handleUnlinkAbapGitRepo(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answer(
    { tool: 'UnlinkAbapGitRepo', detail: 'terse' },
    async () => {
      const repo = admittedRepo(admissionOf(context));
      return abapGitClientOf(context.connection, context.logger).unlink(
        {
          repositoryId: repo.key,
        },
        { analyse: analyseException },
      );
    },
    () => JSON.stringify({ result: 'done' }),
  );
}
