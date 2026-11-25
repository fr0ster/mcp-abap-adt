/**
 * PushAbapGitRepo: commit and push the chosen objects (R10), with the
 * credential bound to the R1 entry's URL. Author and committer are
 * required: SAP takes them from the request only.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  AUTHOR_FIELD,
  COMMENT_FIELD,
  COMMITTER_FIELD,
  OBJECTS_FIELD,
  REPOSITORY_KEY_FIELD,
  type StagedObjectArgument,
} from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import { statusAnswer } from '../../../lib/abapGit/formats';
import type { KindToolDefinition } from '../../../lib/abapGit/kindTool';
import { BACKGROUND_FIELD } from '../../../lib/backgroundRuns/tools';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

const FIELDS = {
  repository_key: REPOSITORY_KEY_FIELD,
  objects: OBJECTS_FIELD,
  comment: COMMENT_FIELD,
  author: AUTHOR_FIELD,
  committer: COMMITTER_FIELD,
};

const ONPREM_SCHEMA = z.object({ ...FIELDS, background: BACKGROUND_FIELD });
const CLOUD_SCHEMA = z.object(FIELDS);

const ONPREM_PARTS = runParts({
  purpose: purpose(
    "Pushes the objects and files chosen from an abapGit repository's staging to its remote branch, as a commit with its comment, author and committer.",
  ),
});

export const TOOL_DEFINITION: KindToolDefinition<
  typeof ONPREM_SCHEMA,
  typeof CLOUD_SCHEMA
> = {
  name: 'PushAbapGitRepo',
  description: toolDescription(ONPREM_PARTS),
  inputSchema: ONPREM_SCHEMA,
  onprem: {
    description: toolDescription(ONPREM_PARTS),
    inputSchema: ONPREM_SCHEMA,
  },
  cloud: {
    description: toolDescription(
      runParts({
        purpose: purpose(
          "Pushes the objects and files chosen from an abapGit repository's staging to its remote branch as a commit, run as an SAP job.",
        ),
      }),
    ),
    inputSchema: CLOUD_SCHEMA,
  },
};

/** A chosen object as SAP's staging names it. */
function stagedOf(object: StagedObjectArgument) {
  return {
    wbkey: object.wbkey,
    version: object.version,
    uri: object.uri,
    type: object.type,
    name: object.name,
    packageName: object.package_name,
    files: object.files.map((file) => ({
      name: file.name,
      path: file.path,
      localState: file.local_state,
      remoteState: file.remote_state,
    })),
  };
}

export async function handlePushAbapGitRepo(
  context: HandlerContext,
  args: z.output<typeof CLOUD_SCHEMA>,
) {
  return answer(
    { tool: 'PushAbapGitRepo', detail: 'terse' },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).push(
        {
          key: repo.key,
          staged: args.objects.map(stagedOf),
          comment: {
            text: args.comment,
            author: { name: args.author.name, email: args.author.email },
            committer: {
              name: args.committer.name,
              email: args.committer.email,
            },
          },
        },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    statusAnswer,
  );
}
