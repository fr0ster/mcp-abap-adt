/**
 * GetAbapGitFile: one file of the repository, the system's version or the
 * remote's (R12), with the credential bound to the R1 entry's URL.
 */

import type { IAbapGitFileFacts } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  FILENAME_FIELD,
  REPOSITORY_KEY_FIELD,
  VERSION_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import { membersOf, purpose, toolDescription } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitFile',
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads one file of an abapGit repository, as the system holds it or as the remote branch holds it.',
    ),
    returns: membersOf<Pick<IAbapGitFileFacts, 'content'>>({
      of: 'the',
      nouns: {
        content: "file's text as it is",
      },
    }),
  }),
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    filename: FILENAME_FIELD,
    version: VERSION_FIELD,
  }),
} as const;

export async function handleGetAbapGitFile(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answer(
    { tool: 'GetAbapGitFile', detail: 'terse' },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).getFile(
        { key: repo.key, filename: args.filename, version: args.version },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    (value) => value.facts.content,
  );
}
