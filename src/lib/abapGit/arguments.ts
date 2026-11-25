/**
 * The arguments of the abapGit tools (spec §4.1), snake_case, one field
 * each, shared by the full tools and the compact actions (whose arguments
 * are top-level and the full tool's, spec §4.2). No argument carries a
 * credential: it comes from the approved endpoints (spec §5).
 */

import * as z from 'zod';

export const REPOSITORY_KEY_FIELD = z
  .string()
  .describe('The key of a linked repository, as ListAbapGitRepos answers it.');

export const URL_FIELD = z
  .string()
  .describe(
    'The remote repository URL over HTTPS, without a user, a password, a query or a fragment.',
  );

export const PACKAGE_NAME_FIELD = z
  .string()
  .describe('The ABAP package the repository is linked to.');

export const BRANCH_FIELD = z
  .string()
  .describe(
    'The branch, as CheckAbapGitExternalRepo lists it (for example refs/heads/main).',
  );

export const TRANSPORT_REQUEST_FIELD = z
  .string()
  .optional()
  .describe('The transport request that records the objects written.');

export const FOLDER_LOGIC_FIELD = z
  .enum(['FULL', 'PREFIX'])
  .optional()
  .describe(
    "How the repository's folders map to subpackages: FULL or PREFIX (SAP's default FULL).",
  );

export const FILENAME_FIELD = z
  .string()
  .describe(
    'The file name, as GetAbapGitStaging lists it (for example zcl_demo.clas.abap).',
  );

export const VERSION_FIELD = z
  .enum(['local', 'remote'])
  .describe(
    "Which version of the file: local (the system's) or remote (the remote branch's).",
  );

export const APP_LOG_KEY_FIELD = z
  .string()
  .describe(
    "The run log key ListAbapGitRepos answers for the repository's last run.",
  );

export const CREATE_FIELD = z
  .boolean()
  .describe(
    'true creates the branch in the remote when it does not exist; false switches to an existing branch only.',
  );

const PERSON = z.object({
  name: z.string().describe('The name.'),
  email: z.string().describe('The e-mail address.'),
});

export const AUTHOR_FIELD = PERSON.describe(
  'The commit author: name and email (GetAbapGitStaging answers the proposal of this system).',
);

export const COMMITTER_FIELD = PERSON.describe(
  'The committer: name and email (GetAbapGitStaging answers the proposal of this system).',
);

export const COMMENT_FIELD = z.string().describe('The commit message.');

const STAGED_FILE = z.object({
  name: z.string().describe('The file name.'),
  path: z.string().describe('The file path.'),
  local_state: z.string().describe("The file's local state."),
  remote_state: z.string().describe("The file's remote state."),
});

const STAGED_OBJECT = z.object({
  wbkey: z.string().describe("The object's workbench key."),
  version: z.string().describe("The object's version."),
  uri: z.string().describe("The object's ADT URI."),
  type: z.string().describe("The object's ADT type."),
  name: z.string().describe("The object's name."),
  package_name: z.string().describe("The object's package."),
  files: z.array(STAGED_FILE).describe('The files of the object to commit.'),
});

export const OBJECTS_FIELD = z
  .array(STAGED_OBJECT)
  .describe(
    'The objects and files to commit, each as GetAbapGitStaging with detail "medium" answers it.',
  );

const OVERWRITE_OBJECT = z.object({
  type: z
    .string()
    .min(1)
    .describe("The object's type, as GetAbapGitModifiedObjects answers it."),
  name: z
    .string()
    .min(1)
    .describe("The object's name, as GetAbapGitModifiedObjects answers it."),
});

export const OVERWRITE_FIELD = z
  .array(OVERWRITE_OBJECT)
  .min(1)
  .describe(
    'The objects listed by GetAbapGitModifiedObjects to overwrite with their remote version, each once, by type and name; a name the list holds under two types is refused, within one list or across both: SAP matches by name within each list, so a collision inside one list could take an object not named. SAP selects by name when its job runs, against the list as it stands then: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state; SAP leaves a package warning with action 5 (delete and re-create) out of every pull. Without it the job takes every other listed object.',
  );

/** An object a pull overwrites, as the tool takes it. */
export type OverwriteArgument = z.output<typeof OVERWRITE_OBJECT>;

/** A staged object as the tool takes it. */
export type StagedObjectArgument = z.output<typeof STAGED_OBJECT>;
