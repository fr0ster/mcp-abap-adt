/**
 * LinkAbapGitRepo: link a package to a remote repository (R2, the new form
 * of `link`), sent to the URL the admission bound with its credential, or
 * anonymously (`credentials: null`). On premise SAP's link also imports
 * every object of the branch; on cloud it links only. `folder_logic` is
 * cloud's.
 */

import * as z from 'zod';
import { answer } from '../../../lib/abapGit/answers';
import {
  BRANCH_FIELD,
  FOLDER_LOGIC_FIELD,
  PACKAGE_NAME_FIELD,
  TRANSPORT_REQUEST_FIELD,
  URL_FIELD,
} from '../../../lib/abapGit/arguments';
import {
  ABAPGIT_HEADERS,
  abapGitClientOf,
  abapGitVerdict,
  admissionOf,
  admittedUrl,
} from '../../../lib/abapGit/client';
import { objectsAnswer } from '../../../lib/abapGit/formats';
import type { KindToolDefinition } from '../../../lib/abapGit/kindTool';
import { BACKGROUND_FIELD } from '../../../lib/backgroundRuns/tools';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { ABAPGIT_OBJECTS } from '../../../lib/description/sessions';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

const FIELDS = {
  package_name: PACKAGE_NAME_FIELD,
  url: URL_FIELD,
  branch: BRANCH_FIELD,
  transport_request: TRANSPORT_REQUEST_FIELD,
};

const ONPREM_SCHEMA = z.object({ ...FIELDS, background: BACKGROUND_FIELD });
const CLOUD_SCHEMA = z.object({ ...FIELDS, folder_logic: FOLDER_LOGIC_FIELD });

/**
 * What either kind parses: `folder_logic` is cloud's alone; `background`,
 * on premise's alone, is the server's (read and taken out before the call).
 */
type LinkArgs = z.output<typeof CLOUD_SCHEMA>;

const ONPREM_PARTS = runParts({
  purpose: purpose(
    "Links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport.",
  ),
  result: ABAPGIT_OBJECTS,
});

export const TOOL_DEFINITION: KindToolDefinition<
  typeof ONPREM_SCHEMA,
  typeof CLOUD_SCHEMA
> = {
  name: 'LinkAbapGitRepo',
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
          'Links an ABAP package to a remote abapGit repository on a branch, mapping its folders to subpackages as asked.',
        ),
        result: ABAPGIT_OBJECTS,
      }),
    ),
    inputSchema: CLOUD_SCHEMA,
  },
};

export async function handleLinkAbapGitRepo(
  context: HandlerContext,
  args: LinkArgs,
) {
  return answer(
    { tool: 'LinkAbapGitRepo', detail: 'terse' },
    async () => {
      const { url, credentials } = admittedUrl(admissionOf(context));
      return abapGitClientOf(context.connection, context.logger).link(
        {
          package: args.package_name,
          url,
          branchName: args.branch,
          ...(args.transport_request !== undefined
            ? { transportRequest: args.transport_request }
            : {}),
          ...(args.folder_logic !== undefined
            ? { folderLogic: args.folder_logic }
            : {}),
        },
        { headers: ABAPGIT_HEADERS.link, credentials, analyse: abapGitVerdict },
      );
    },
    objectsAnswer,
  );
}
