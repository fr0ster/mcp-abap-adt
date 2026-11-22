/**
 * PullAbapGitRepo: pull a repository by its key (R4, `pullRepo`), on the
 * branch R1 lists for it — never a branch of the arguments, never a
 * selection (`repo.v3`) — with the credential bound to the R1 entry's URL.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  REPOSITORY_KEY_FIELD,
  TRANSPORT_REQUEST_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  ABAPGIT_HEADERS,
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import { objectsAnswer } from '../../../lib/abapGit/formats';
import type { KindToolDefinition } from '../../../lib/abapGit/kindTool';
import { BACKGROUND_FIELD } from '../../../lib/backgroundRuns/tools';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

const FIELDS = {
  repository_key: REPOSITORY_KEY_FIELD,
  transport_request: TRANSPORT_REQUEST_FIELD,
};

const ONPREM_SCHEMA = z.object({ ...FIELDS, background: BACKGROUND_FIELD });
const CLOUD_SCHEMA = z.object(FIELDS);

const IMPORTS =
  'every object changed in the remote is imported, objects changed in the system are overwritten, and objects held by other packages are written too';

const ONPREM_DESCRIPTION = `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${IMPORTS}. Ends on SAP's answer, or with background true runs on an ABAP session of its own. Answers facts only: SAP's status, done, and the objects SAP lists.`;

export const TOOL_DEFINITION: KindToolDefinition<
  typeof ONPREM_SCHEMA,
  typeof CLOUD_SCHEMA
> = {
  name: 'PullAbapGitRepo',
  description: ONPREM_DESCRIPTION,
  onprem: {
    description: ONPREM_DESCRIPTION,
    inputSchema: ONPREM_SCHEMA,
  },
  cloud: {
    description: `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${IMPORTS}. SAP accepts it as its own job, which runs to its end; the objects it imports are inactive, and the repository list shows its run state. Answers facts only: SAP's status and accepted.`,
    inputSchema: CLOUD_SCHEMA,
  },
};

export async function handlePullAbapGitRepo(
  context: HandlerContext,
  args: z.output<typeof CLOUD_SCHEMA>,
) {
  return answer(
    { tool: 'PullAbapGitRepo', detail: 'terse' },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(context.connection, context.logger).pullRepo(
        {
          key: repo.key,
          branchName: repo.branchName,
          ...(args.transport_request !== undefined
            ? { transportRequest: args.transport_request }
            : {}),
        },
        {
          ...credentialOption(admission),
          headers: ABAPGIT_HEADERS.pull,
          analyse: abapGitVerdict,
        },
      );
    },
    objectsAnswer,
  );
}
