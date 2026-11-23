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
 * On the cloud (Code, read 2026-11-23): R6 lists every changed object
 * (`CL_ABAPGIT_OBJECTS_CHECK=>warning_overwrite_find` L140–210). SAP's pull
 * handler hands its job every R6 entry when the request selects none
 * (`CL_ABAPGIT_RES_REPO_PULL->post` L234–240), only the selected ones with
 * `overwrite` (L230–233); the job marks the others `N`
 * (`CL_ABAPGIT_BG_ACTION_PULL->execute` L123–152), and the import drops an
 * `N` entry only when it is changed locally or held by another package
 * (`CL_ABAPGIT_OBJECTS->warning_overwrite_adjust` L1791,
 * `warning_package_adjust`): a remote-only change is imported either way.
 */
const CLOUD_IMPORTS =
  'every object the modified-objects read lists is brought to its remote version; with overwrite, SAP selects by name against the list as it stands when its job runs: the objects changed in the system or held by another package are overwritten when overwrite names them, the others keeping their system version, and the objects changed only in the remote are imported either way';

const ONPREM_DESCRIPTION = `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${IMPORTS}. Ends on SAP's answer, or with background true runs on an ABAP session of its own. Answers facts only: SAP's status, done, and the objects SAP lists.`;

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
    description: `Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: ${CLOUD_IMPORTS}. SAP accepts it as its own job, which runs to its end; the objects it imports are inactive, and the repository list shows its run state. Answers facts only: SAP's status and accepted.`,
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
