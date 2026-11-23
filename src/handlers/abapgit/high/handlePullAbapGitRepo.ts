/**
 * PullAbapGitRepo: pull a repository by its key (R4, `pullRepo`), on the
 * branch R1 lists for it — never a branch of the arguments — with the
 * credential bound to the R1 entry's URL. Without `overwrite` the
 * `repo.v3` document; on the cloud with `overwrite`, R6 is read first and
 * the entries it names are sent as R6 answered them (`pull.req.v1`,
 * `pullSelection.ts`). On premise the pull takes no selection
 * (`ZCL_ABAPGIT_RES_REPO_PULL->post` reads the user, the password and the
 * request only; adt-clients ERRATA), so `overwrite` is cloud's.
 */

import type { IAbapGitPullSelection } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import {
  type AbapGitAnswerContext,
  abapGitFailure,
  abapGitThrown,
  answer,
} from '../../../lib/abapGit/answers';
import {
  OVERWRITE_FIELD,
  type OverwriteArgument,
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
import { pullSelection } from '../../../lib/abapGit/pullSelection';
import type { McpResult } from '../../../lib/answer';
import { BACKGROUND_FIELD } from '../../../lib/backgroundRuns/tools';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

const FIELDS = {
  repository_key: REPOSITORY_KEY_FIELD,
  transport_request: TRANSPORT_REQUEST_FIELD,
};

const ONPREM_SCHEMA = z.object({ ...FIELDS, background: BACKGROUND_FIELD });
const CLOUD_SCHEMA = z.object({
  ...FIELDS,
  overwrite: OVERWRITE_FIELD.optional(),
});

const IMPORTS =
  'every object changed in the remote is imported, objects changed in the system are overwritten, and objects held by other packages are written too';

/**
 * On the cloud (Code, read 2026-11-23): SAP's pull handler hands its job
 * every R6 entry when the request selects none (`CL_ABAPGIT_RES_REPO_PULL->
 * post` L234–240), only the selected ones with `overwrite` (L230–233); the
 * job marks the others `N` (`CL_ABAPGIT_BG_ACTION_PULL->execute`
 * L123–152), a package warning with action 5 always `N` (L143–146). Of
 * the `N` entries, one with a local state, a remote deletion and any
 * package warning stay out; an `N` remote-only add or update is imported
 * (`pullSelection.ts`).
 */
const CLOUD_IMPORTS =
  'the job takes every object the modified-objects read lists and brings it to its remote version, a package warning with action 5 (delete and re-create) excepted: SAP leaves it out; given overwrite, SAP selects by name against the list as it stands when its job runs: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state';

const ONPREM_DESCRIPTION = `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${IMPORTS}. Ends on SAP's answer, or with background true runs on an ABAP session of its own. When SAP's request or its response is lost mid-import (an SSE or stdio close logs the connection off), the outcome is unknown to this server and what SAP does then is unverified (unread in SAP's code, unmeasured): the repository's staging read shows the current differences, whichever writes made them. Answers facts only: SAP's status, done, and the objects SAP lists.`;

export const TOOL_DEFINITION: KindToolDefinition<
  typeof ONPREM_SCHEMA,
  typeof CLOUD_SCHEMA
> = {
  name: 'PullAbapGitRepo',
  description: ONPREM_DESCRIPTION,
  inputSchema: ONPREM_SCHEMA,
  onprem: {
    description: ONPREM_DESCRIPTION,
    inputSchema: ONPREM_SCHEMA,
  },
  cloud: {
    description: `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${CLOUD_IMPORTS}. SAP accepts it as its own job, which runs to its end whatever happens to the client or its connection after the call; the objects it imports are inactive, and the repository list shows its run state. Answers facts only: SAP's status and accepted.`,
    inputSchema: CLOUD_SCHEMA,
  },
};

/** The selection `overwrite` names, read off R6; or the call's answer when it is refused. */
async function selectionOf(
  context: HandlerContext,
  overwrite: readonly OverwriteArgument[],
  ctx: AbapGitAnswerContext,
): Promise<
  | { readonly selection: IAbapGitPullSelection }
  | { readonly refused: McpResult }
> {
  try {
    const admission = admissionOf(context);
    const repo = admittedRepo(admission);
    const modified = await abapGitClientOf(
      context.connection,
      context.logger,
    ).getModifiedObjects(
      { key: repo.key },
      { ...credentialOption(admission), analyse: abapGitVerdict },
    );
    if (!modified.ok) return { refused: abapGitFailure(modified.getError()) };
    return {
      selection: pullSelection(modified.getResult().value.facts, overwrite),
    };
  } catch (thrown) {
    return { refused: abapGitThrown(thrown, ctx) };
  }
}

export async function handlePullAbapGitRepo(
  context: HandlerContext,
  args: z.output<typeof CLOUD_SCHEMA>,
) {
  const ctx: AbapGitAnswerContext = {
    tool: 'PullAbapGitRepo',
    detail: 'terse',
  };
  let selection: IAbapGitPullSelection | undefined;
  if (args.overwrite !== undefined) {
    const selected = await selectionOf(context, args.overwrite, ctx);
    if ('refused' in selected) return selected.refused;
    selection = selected.selection;
  }
  return answer(
    ctx,
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      const client = abapGitClientOf(context.connection, context.logger);
      const pull = {
        key: repo.key,
        branchName: repo.branchName,
        ...(args.transport_request !== undefined
          ? { transportRequest: args.transport_request }
          : {}),
      };
      const options = {
        ...credentialOption(admission),
        analyse: abapGitVerdict,
      };
      return selection === undefined
        ? client.pullRepo(pull, { ...options, headers: ABAPGIT_HEADERS.pull })
        : client.pullRepo(
            { ...pull, selection },
            { ...options, headers: ABAPGIT_HEADERS.pullSelective },
          );
    },
    objectsAnswer,
  );
}
