/**
 * GetAbapGitModifiedObjects: what a pull of the repository would change
 * (R6, cloud): `deserialize_checks`' overwrite list without the
 * repository's own package (`CL_ABAPGIT_RES_PULL_MOD_OBJS->
 * get_all_modified_objects` L127–130) and its package warnings (L162–173;
 * `CL_ABAPGIT_OBJECTS_CHECK=>warning_package_find` L257–295), with SAP's
 * action for each
 * (`CL_ABAPGIT_OBJECTS_CHECK=>warning_overwrite_find` L140–210,
 * `IF_ABAPGIT_OBJECTS=>c_deserialize_action`; Code, cloud 2026-11-23),
 * with the credential bound to the R1 entry's URL.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import { REPOSITORY_KEY_FIELD } from '../../../lib/abapGit/arguments';
import {
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedRepo,
  credentialOption,
} from '../../../lib/abapGit/client';
import {
  ABAPGIT_DETAIL_SHAPE,
  MODIFIED_OBJECTS_ANSWERS,
} from '../../../lib/abapGit/formats';
import { answerAt } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';

export const TOOL_DEFINITION = {
  name: 'GetAbapGitModifiedObjects',
  available_in: ['cloud'] as const,
  description:
    "[read-only] Reads what a pull of the repository would change in the system: every changed object (changed in the remote, in the system or in both, added or deleted on either side), the repository's own package left out, and as package warnings the objects whose package in the system differs from the package their path maps to. Answers facts only: each object with its type, name, package, URI and SAP's action: 1 add, 2 update (changed only in the remote), 3 overwrite (changed in the system), 4 delete, 5 delete and re-create, 6 package move; SAP leaves a package warning with action 5 out of every selection.",
  inputSchema: z.object({
    repository_key: REPOSITORY_KEY_FIELD,
    ...ABAPGIT_DETAIL_SHAPE,
  }),
} as const;

export async function handleGetAbapGitModifiedObjects(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const format = answerAt(MODIFIED_OBJECTS_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetAbapGitModifiedObjects', detail: detailOf(args) },
    async () => {
      const admission = admissionOf(context);
      const repo = admittedRepo(admission);
      return abapGitClientOf(
        context.connection,
        context.logger,
      ).getModifiedObjects(
        { key: repo.key },
        { ...credentialOption(admission), analyse: abapGitVerdict },
      );
    },
    format,
  );
}
