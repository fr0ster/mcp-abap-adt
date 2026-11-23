/**
 * The compact abapGit tools (spec §4.2): `HandlerAbapGitGet` (the reads,
 * compact and compact `-ro`) and `HandlerAbapGit` (the writes, compact
 * only), one `action` each naming the full tool it runs. The arguments are
 * top-level and the full tool's, so the access hook and the admission see
 * `package_name`, `transport_request` and `repository_key` where the full
 * tools carry them.
 *
 * Each variant's enum holds only what that system kind serves; schema and
 * description are narrowed to the actions offered, as `HandlerSystem`'s are:
 * a property no offered action takes is left out. Every action is deniable
 * (`HandlerAbapGit.push`), its definition built by the same builder.
 */

import * as z from 'zod';
import {
  APP_LOG_KEY_FIELD,
  AUTHOR_FIELD,
  BRANCH_FIELD,
  COMMENT_FIELD,
  COMMITTER_FIELD,
  CREATE_FIELD,
  FILENAME_FIELD,
  FOLDER_LOGIC_FIELD,
  OBJECTS_FIELD,
  OVERWRITE_FIELD,
  PACKAGE_NAME_FIELD,
  REPOSITORY_KEY_FIELD,
  TRANSPORT_REQUEST_FIELD,
  URL_FIELD,
  VERSION_FIELD,
} from '../../abapGit/arguments';
import { ABAPGIT_DETAIL_SHAPE } from '../../abapGit/formats';
import type { ProjectionVariant } from '../../adtProjections';
import { COMPACT_BACKGROUND_FIELD } from '../../backgroundRuns/tools';
import { listedValues } from '../../handlers/listedValues';

/** `HandlerAbapGitGet`'s actions, each a full read. */
export const ABAPGIT_GET_ACTIONS = [
  'repos',
  'external_repo',
  'modified_objects',
  'staging',
  'checks',
  'file',
  'error_log',
] as const;
export type AbapGitGetAction = (typeof ABAPGIT_GET_ACTIONS)[number];

/** `HandlerAbapGit`'s actions, each a full write. */
export const ABAPGIT_WRITE_ACTIONS = [
  'link',
  'unlink',
  'pull',
  'push',
  'switch_branch',
  'branch_info',
] as const;
export type AbapGitWriteAction = (typeof ABAPGIT_WRITE_ACTIONS)[number];

/** The full tool each action runs. */
export const ABAPGIT_ACTION_TOOLS = {
  repos: 'ListAbapGitRepos',
  external_repo: 'CheckAbapGitExternalRepo',
  modified_objects: 'GetAbapGitModifiedObjects',
  staging: 'GetAbapGitStaging',
  checks: 'CheckAbapGitRepo',
  file: 'GetAbapGitFile',
  error_log: 'GetAbapGitErrorLog',
  link: 'LinkAbapGitRepo',
  unlink: 'UnlinkAbapGitRepo',
  pull: 'PullAbapGitRepo',
  push: 'PushAbapGitRepo',
  switch_branch: 'SwitchAbapGitBranch',
  branch_info: 'GetAbapGitBranchInfo',
} as const satisfies Readonly<
  Record<AbapGitGetAction | AbapGitWriteAction, string>
>;

/** The reads each kind serves: the run log and the modified objects are cloud's. */
export const ABAPGIT_GET_ON: {
  readonly [V in ProjectionVariant]: readonly AbapGitGetAction[];
} = {
  onprem: ['repos', 'external_repo', 'staging', 'checks', 'file'],
  cloud: ABAPGIT_GET_ACTIONS,
};

/** The writes each kind serves: the branch switch is on premise's, the branch info cloud's. */
export const ABAPGIT_WRITE_ON: {
  readonly [V in ProjectionVariant]: readonly AbapGitWriteAction[];
} = {
  onprem: ['link', 'unlink', 'pull', 'push', 'switch_branch'],
  cloud: ['link', 'unlink', 'pull', 'push', 'branch_info'],
};

/** The words of a property, per action that takes it. */
type Said<A extends string> = { readonly [K in A]?: string };

/** The words of `words` for those of `actions` that take the property. */
function said<A extends string>(actions: readonly A[], words: Said<A>): string {
  return actions
    .flatMap((action) => {
      const text = words[action];
      return text === undefined ? [] : [`${action}: ${text}`];
    })
    .join(' ');
}

/**
 * `properties` with only the keys some of `actions` takes (`takes`), in
 * their declared order. Its type names every property, each optional, so
 * every narrowing types its schema the same.
 */
function offered<P extends object, A extends string>(
  properties: P,
  takes: { readonly [K in A]: readonly (keyof P)[] },
  actions: readonly A[],
): P {
  const taken = new Set<keyof P>(actions.flatMap((action) => takes[action]));
  const kept = { ...properties };
  for (const key in kept) {
    if (key !== 'action' && !taken.has(key)) delete kept[key];
  }
  return kept;
}

const ACTION_WORDS_GET: Readonly<Record<AbapGitGetAction, string>> = {
  repos: 'repos (the linked repositories)',
  external_repo: 'external_repo (what a remote repository offers)',
  modified_objects: 'modified_objects (what a pull would change)',
  staging: 'staging (what changed)',
  checks: "checks (the repository's connection to its remote)",
  file: 'file (one file of the repository)',
  error_log: "error_log (a run's log)",
};

const ACTION_WORDS_WRITE: Readonly<Record<AbapGitWriteAction, string>> = {
  link: 'link (link a package to a remote repository)',
  unlink: "unlink (end a repository's binding to its package)",
  pull: 'pull (import the remote branch)',
  push: 'push (commit and push chosen objects)',
  switch_branch: "switch_branch (switch or create the repository's branch)",
  branch_info:
    'branch_info (one remote branch for a package, SAP links and unlinks to answer it)',
};

/** The words of `detail`: the full tools' own. */
const ABAPGIT_DETAIL_WORDS = ABAPGIT_DETAIL_SHAPE.detail.description ?? '';

/** Every property `HandlerAbapGitGet` takes on `actions`. */
function getProperties(actions: readonly AbapGitGetAction[]) {
  return {
    action: listedValues(actions).describe(
      `The read: ${actions.map((action) => ACTION_WORDS_GET[action]).join(', ')}.`,
    ),
    repository_key: REPOSITORY_KEY_FIELD.optional().describe(
      said(actions, {
        repos: 'only the repository with this key.',
        modified_objects: 'required, the repository.',
        staging: 'required, the repository.',
        checks: 'required, the repository.',
        file: 'required, the repository.',
        error_log: 'required, the repository.',
      }),
    ),
    package_name: PACKAGE_NAME_FIELD.optional().describe(
      said(actions, { repos: 'only the repository linked to this package.' }),
    ),
    url: URL_FIELD.optional().describe(
      said(actions, {
        external_repo:
          'required, the remote repository URL over HTTPS, without a user, a password, a query or a fragment.',
      }),
    ),
    filename: FILENAME_FIELD.optional().describe(
      said(actions, { file: 'required, the file name.' }),
    ),
    version: VERSION_FIELD.optional().describe(
      said(actions, {
        file: "required, local (the system's) or remote (the remote branch's).",
      }),
    ),
    app_log_key: APP_LOG_KEY_FIELD.optional().describe(
      said(actions, {
        error_log:
          "required, the run log key the repository list answers for the repository's last run.",
      }),
    ),
    detail: ABAPGIT_DETAIL_SHAPE.detail.describe(
      said(actions, {
        repos: ABAPGIT_DETAIL_WORDS,
        external_repo: ABAPGIT_DETAIL_WORDS,
        modified_objects: ABAPGIT_DETAIL_WORDS,
        staging: ABAPGIT_DETAIL_WORDS,
        error_log: ABAPGIT_DETAIL_WORDS,
      }),
    ),
  };
}

type GetProperty = Exclude<keyof ReturnType<typeof getProperties>, 'action'>;

const GET_TAKES: { readonly [A in AbapGitGetAction]: readonly GetProperty[] } =
  {
    repos: ['package_name', 'repository_key', 'detail'],
    external_repo: ['url', 'detail'],
    modified_objects: ['repository_key', 'detail'],
    staging: ['repository_key', 'detail'],
    checks: ['repository_key'],
    file: ['repository_key', 'filename', 'version'],
    error_log: ['repository_key', 'app_log_key', 'detail'],
  };

/** The words of `background` on premise: the compact run tool's own. */
const ON_PREMISE_BACKGROUND_WORDS = COMPACT_BACKGROUND_FIELD.description ?? '';

/** Every property `HandlerAbapGit` takes on `actions`. */
function writeProperties(actions: readonly AbapGitWriteAction[]) {
  return {
    action: listedValues(actions).describe(
      `The write: ${actions.map((action) => ACTION_WORDS_WRITE[action]).join(', ')}.`,
    ),
    repository_key: REPOSITORY_KEY_FIELD.optional().describe(
      said(actions, {
        unlink: 'required, the repository.',
        pull: 'required, the repository.',
        push: 'required, the repository.',
        switch_branch: 'required, the repository.',
      }),
    ),
    package_name: PACKAGE_NAME_FIELD.optional().describe(
      said(actions, {
        link: 'required, the package linked.',
        branch_info: 'required, the package SAP links to answer.',
      }),
    ),
    url: URL_FIELD.optional().describe(
      said(actions, {
        link: 'required, the remote repository URL over HTTPS.',
        branch_info: 'required, the remote repository URL over HTTPS.',
      }),
    ),
    branch: BRANCH_FIELD.optional().describe(
      said(actions, {
        link: 'required, the branch linked.',
        switch_branch: 'required, the branch switched to.',
        branch_info: 'required, the branch read.',
      }),
    ),
    transport_request: TRANSPORT_REQUEST_FIELD.describe(
      said(actions, {
        link: 'the transport request that records the objects written.',
        pull: 'the transport request that records the objects written.',
      }),
    ),
    folder_logic: FOLDER_LOGIC_FIELD.describe(
      said(actions, {
        link: 'cloud: how folders map to subpackages, FULL or PREFIX.',
      }),
    ),
    objects: OBJECTS_FIELD.optional().describe(
      said(actions, {
        push: 'required, the objects and files to commit, as staging with detail "medium" answers them.',
      }),
    ),
    overwrite: OVERWRITE_FIELD.optional().describe(
      said(actions, {
        pull: 'cloud: the objects of modified_objects to overwrite with their remote version, each once, by type and name; a name the list holds under two types is refused, within one list or across both: SAP matches by name within each list, so a collision inside one list could take an object not named. SAP selects by name when its job runs, against the list as it stands then: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state; SAP leaves a package warning with action 5 (delete and re-create) out of every pull. Without it the job takes every other listed object.',
      }),
    ),
    comment: COMMENT_FIELD.optional().describe(
      said(actions, { push: 'required, the commit message.' }),
    ),
    author: AUTHOR_FIELD.optional().describe(
      said(actions, { push: 'required, the commit author: name and email.' }),
    ),
    committer: COMMITTER_FIELD.optional().describe(
      said(actions, { push: 'required, the committer: name and email.' }),
    ),
    create: CREATE_FIELD.optional().describe(
      said(actions, {
        switch_branch:
          'required, true creates the branch in the remote when it does not exist.',
      }),
    ),
    detail: ABAPGIT_DETAIL_SHAPE.detail.describe(
      said(actions, { branch_info: ABAPGIT_DETAIL_WORDS }),
    ),
    background: COMPACT_BACKGROUND_FIELD.describe(
      said(actions, {
        link: ON_PREMISE_BACKGROUND_WORDS,
        pull: ON_PREMISE_BACKGROUND_WORDS,
        push: ON_PREMISE_BACKGROUND_WORDS,
      }),
    ),
  };
}

type WriteProperty = Exclude<
  keyof ReturnType<typeof writeProperties>,
  'action'
>;

/**
 * What each write takes on `variant`: `folder_logic` is cloud's link's;
 * `background` on premise's link, pull and push (spec §4.6).
 */
function writeTakes(variant: ProjectionVariant): {
  readonly [A in AbapGitWriteAction]: readonly WriteProperty[];
} {
  const background =
    variant === 'onprem' ? (['background'] as const) : ([] as const);
  return {
    link: [
      'package_name',
      'url',
      'branch',
      'transport_request',
      ...(variant === 'cloud' ? (['folder_logic'] as const) : []),
      ...background,
    ],
    unlink: ['repository_key'],
    pull: [
      'repository_key',
      'transport_request',
      ...(variant === 'cloud' ? (['overwrite'] as const) : []),
      ...background,
    ],
    push: [
      'repository_key',
      'objects',
      'comment',
      'author',
      'committer',
      ...background,
    ],
    switch_branch: ['repository_key', 'branch', 'create'],
    branch_info: ['url', 'branch', 'package_name', 'detail'],
  };
}

const ACTION_SENTENCES_GET: Readonly<Record<AbapGitGetAction, string>> = {
  repos:
    'repos(package_name, repository_key, detail) the linked repositories: key, package, branch, remote URL and on cloud the run state (status, status text, run log key)',
  external_repo:
    'external_repo(url*, detail) the access mode and the branches of the remote repository at url',
  modified_objects:
    "modified_objects(repository_key*, detail) what a pull would change: every changed object (changed in the remote, in the system or both, added or deleted), the repository's own package left out, and as package warnings the objects whose package in the system differs from the package their path maps to, each with SAP's action (1 add, 2 update: changed only in the remote, 3 overwrite: changed in the system, 4 delete, 5 delete and re-create, 6 package move); SAP leaves a package warning with action 5 out of every selection",
  staging:
    'staging(repository_key*, detail) the unstaged, staged and ignored objects with their files, and the proposed author and committer',
  checks:
    "checks(repository_key*) SAP's status of the connection to the remote; a refusal with SAP's message key and on cloud the git host's HTTP status",
  file: 'file(repository_key*, filename*, version*) the text of one file, local or remote',
  error_log:
    "error_log(repository_key*, app_log_key*, detail) each object of the repository's last run with its status and message type",
};

const ACTION_SENTENCES_WRITE: Readonly<Record<AbapGitWriteAction, string>> = {
  link: 'link(package_name*, url*, branch*, transport_request) links the package to the remote repository; on premise it also imports every object of the branch',
  unlink:
    "unlink(repository_key*) ends the repository's binding to its package; the objects stay",
  pull: 'pull(repository_key*, transport_request) imports every object changed in the remote branch the repository is linked on; on premise it overwrites local changes and objects of other packages, and when the SAP request or its response is lost mid-import (an SSE or stdio close logs the connection off) the outcome is unknown to this server and what SAP does then is unverified (the staging action shows the current differences, whichever writes made them); on cloud SAP runs it as its own job, which runs to its end whatever happens to the connection, its objects are inactive, and it brings every object modified_objects lists to its remote version, a package warning with action 5 (delete and re-create) excepted, or with overwrite selects by name: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state',
  push: 'push(repository_key*, objects*, comment*, author*, committer*) commits the chosen objects and pushes the commit; on cloud SAP runs it as its own job',
  switch_branch:
    'switch_branch(repository_key*, branch*, create*) switches the branch, creating it in the remote with create true',
  branch_info:
    'branch_info(url*, branch*, package_name*, detail) one remote branch with its folder logic; to answer it SAP binds the repository to package_name for the read',
};

/** `HandlerAbapGitGet`'s description and schema on `actions`. */
export function handlerAbapGitGetDefinitionFor(
  actions: readonly AbapGitGetAction[],
) {
  return {
    description: `[read-only] Reads abapGit repositories, one read per action: ${actions.map((action) => ACTION_SENTENCES_GET[action]).join('; ')}. Answers facts only. Each argument is described with the actions that take it.`,
    inputSchema: z.object(offered(getProperties(actions), GET_TAKES, actions)),
    members: actions,
  };
}

/** `HandlerAbapGit`'s description and schema on `variant` with `actions`. */
export function handlerAbapGitDefinitionFor(
  variant: ProjectionVariant,
  actions: readonly AbapGitWriteAction[],
) {
  return {
    description: `Changes abapGit repositories and their remotes, one write per action: ${actions.map((action) => ACTION_SENTENCES_WRITE[action]).join('; ')}. Answers facts only. Each argument is described with the actions that take it.`,
    inputSchema: z.object(
      offered(writeProperties(actions), writeTakes(variant), actions),
    ),
    members: actions,
  };
}

/** `HandlerAbapGitGet`'s definition, per variant. */
export function handlerAbapGitGetDefinition() {
  const onprem = handlerAbapGitGetDefinitionFor(ABAPGIT_GET_ON.onprem);
  return {
    description: onprem.description,
    inputSchema: onprem.inputSchema,
    variants: {
      onprem,
      cloud: handlerAbapGitGetDefinitionFor(ABAPGIT_GET_ON.cloud),
    },
  };
}

/** `HandlerAbapGit`'s definition, per variant. */
export function handlerAbapGitDefinition() {
  const onprem = handlerAbapGitDefinitionFor('onprem', ABAPGIT_WRITE_ON.onprem);
  return {
    description: onprem.description,
    inputSchema: onprem.inputSchema,
    variants: {
      onprem,
      cloud: handlerAbapGitDefinitionFor('cloud', ABAPGIT_WRITE_ON.cloud),
    },
  };
}
