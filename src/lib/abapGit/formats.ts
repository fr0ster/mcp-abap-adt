/**
 * What an abapGit read answers at each level of `detail` (spec §5.3): a
 * pure formatter of the facts adt-clients' reading kept (`abapGitFacts`),
 * selected before the call (`answerAt(table, levelOf(args))`).
 *
 * - `terse`: TSV of the identifiers and a short description;
 * - `medium`: TSV of every fact field;
 * - `full`: the whole facts object, minified JSON.
 *
 * The abapGit tools offer no `raw` (their answer is facts only, never SAP's
 * document); the table's `raw` entry is unreachable and writes as `full`.
 * Nothing is cut at any level.
 */

import type {
  IAbapGitBranchInfoFacts,
  IAbapGitExternalRepoFacts,
  IAbapGitModifiedObjectsFacts,
  IAbapGitObjectsFacts,
  IAbapGitRepoFacts,
  IAbapGitReposFacts,
  IAbapGitStagingFacts,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAbapGitFactsResponse,
  IAbapGitModifiedObject,
  IAbapGitStagedObject,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import type { AnswerTable } from '../detail';
import { groupedTsv, type TsvGroup, tsv } from '../detail';

/** The levels an abapGit read offers. */
export const ABAPGIT_DETAIL_LEVELS = ['terse', 'medium', 'full'] as const;

/** The `detail` field of an abapGit read's schema. */
export const ABAPGIT_DETAIL_SHAPE = {
  detail: z
    .enum(ABAPGIT_DETAIL_LEVELS)
    .optional()
    .describe(
      'How much of the facts to answer: "terse" (default: TSV of the identifiers and a short description), "medium" (TSV of every fact field), "full" (the whole facts object as JSON).',
    ),
};

/** A table whose `raw` writes as `full`: no abapGit tool offers `raw`. */
function table<V>(formats: {
  readonly terse: (value: V) => string;
  readonly medium: (value: V) => string;
  readonly full: (value: V) => string;
}): AnswerTable<V, string> {
  return { ...formats, raw: formats.full };
}

/** The whole facts object, minified. */
function facts<F>(value: IAbapGitFactsResponse<F>): string {
  return JSON.stringify(value.facts);
}

const yesNo = (value: boolean): string => (value ? 'X' : '');

/** The repository list's entries `filter` keeps (spec §9.2 a). */
export interface ReposFilter {
  readonly packageName?: string | undefined;
  readonly repositoryKey?: string | undefined;
}

/** The entries of `repos` the filter keeps: every one when it names nothing. */
export function filteredRepos(
  repos: readonly IAbapGitRepoFacts[],
  filter: ReposFilter,
): readonly IAbapGitRepoFacts[] {
  return repos.filter(
    (repo) =>
      (filter.packageName === undefined ||
        repo.package === filter.packageName) &&
      (filter.repositoryKey === undefined || repo.key === filter.repositoryKey),
  );
}

/** R1, the repository list. */
export const REPOS_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitReposFacts>,
  string
> = table({
  terse: (value) =>
    tsv(
      ['key', 'package', 'branch_name', 'url', 'run_status'],
      value.facts.repos.map((repo) => [
        repo.key,
        repo.package,
        repo.branchName,
        repo.url,
        repo.runStatus ?? '',
      ]),
    ),
  medium: (value) =>
    tsv(
      [
        'key',
        'package',
        'branch_name',
        'url',
        'run_status',
        'status_text',
        'app_log_key',
      ],
      value.facts.repos.map((repo) => [
        repo.key,
        repo.package,
        repo.branchName,
        repo.url,
        repo.runStatus ?? '',
        repo.statusText ?? '',
        repo.appLogKey ?? '',
      ]),
    ),
  full: facts,
});

/** R13, an external repository's branches. */
export const EXTERNAL_REPO_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitExternalRepoFacts>,
  string
> = table({
  terse: (value) =>
    groupedTsv(
      ['name', 'is_head'],
      [
        {
          field: 'access_mode',
          value: value.facts.accessMode,
          rows: value.facts.branches.map((branch) => [
            branch.name,
            yesNo(branch.isHead),
          ]),
        },
      ],
    ),
  medium: (value) =>
    groupedTsv(
      ['name', 'type', 'is_head', 'sha1'],
      [
        {
          field: 'access_mode',
          value: value.facts.accessMode,
          rows: value.facts.branches.map((branch) => [
            branch.name,
            branch.type,
            yesNo(branch.isHead),
            branch.sha1,
          ]),
        },
      ],
    ),
  full: facts,
});

/** R14, one branch with its folder logic. */
export const BRANCH_INFO_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitBranchInfoFacts>,
  string
> = table({
  terse: (value) =>
    groupedTsv(
      ['name', 'folder_logic'],
      [
        {
          field: 'access_mode',
          value: value.facts.accessMode,
          rows: value.facts.branches.map((branch) => [
            branch.name,
            branch.folderLogic,
          ]),
        },
      ],
    ),
  medium: (value) =>
    groupedTsv(
      ['name', 'type', 'is_head', 'sha1', 'folder_logic'],
      [
        {
          field: 'access_mode',
          value: value.facts.accessMode,
          rows: value.facts.branches.map((branch) => [
            branch.name,
            branch.type,
            yesNo(branch.isHead),
            branch.sha1,
            branch.folderLogic,
          ]),
        },
      ],
    ),
  full: facts,
});

/** R6's objects, as rows of `columns`. */
function modifiedGroups(
  value: IAbapGitModifiedObjectsFacts,
  row: (object: IAbapGitModifiedObject) => string[],
): TsvGroup[] {
  return [
    {
      field: 'list',
      value: 'overwrite',
      rows: value.overwriteObjects.map(row),
    },
    {
      field: 'list',
      value: 'package_warning',
      rows: value.packageWarningObjects.map(row),
    },
  ];
}

/** R6, what a pull would overwrite. */
export const MODIFIED_OBJECTS_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitModifiedObjectsFacts>,
  string
> = table({
  terse: (value) =>
    groupedTsv(
      ['type', 'name', 'package_name'],
      modifiedGroups(value.facts, (object) => [
        object.type,
        object.name,
        object.packageName,
      ]),
    ),
  medium: (value) =>
    groupedTsv(
      ['type', 'name', 'package_name', 'action', 'uri'],
      modifiedGroups(value.facts, (object) => [
        object.type,
        object.name,
        object.packageName,
        String(object.action),
        object.uri,
      ]),
    ),
  full: facts,
});

/** R9's objects as rows, one per file (an object with no file: one row). */
function stagedRows(
  objects: readonly IAbapGitStagedObject[],
  row: (
    object: IAbapGitStagedObject,
    file: IAbapGitStagedObject['files'][number] | undefined,
  ) => string[],
): string[][] {
  return objects.flatMap((object) =>
    object.files.length === 0
      ? [row(object, undefined)]
      : object.files.map((file) => row(object, file)),
  );
}

/** R9's three lists, then SAP's proposed author and committer. */
function stagingGroups(
  value: IAbapGitStagingFacts,
  row: (
    object: IAbapGitStagedObject,
    file: IAbapGitStagedObject['files'][number] | undefined,
  ) => string[],
): TsvGroup[] {
  return [
    { field: 'list', value: 'unstaged', rows: stagedRows(value.unstaged, row) },
    { field: 'list', value: 'staged', rows: stagedRows(value.staged, row) },
    { field: 'list', value: 'ignored', rows: stagedRows(value.ignored, row) },
    {
      field: 'author',
      value: `${value.author.name} <${value.author.email}>`,
      rows: [],
    },
    {
      field: 'committer',
      value: `${value.committer.name} <${value.committer.email}>`,
      rows: [],
    },
  ];
}

/** R9, the staging: what changed, and SAP's proposed author and committer. */
export const STAGING_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitStagingFacts>,
  string
> = table({
  terse: (value) =>
    groupedTsv(
      ['type', 'name', 'package_name', 'file', 'local_state', 'remote_state'],
      stagingGroups(value.facts, (object, file) => [
        object.type,
        object.name,
        object.packageName,
        file?.name ?? '',
        file?.localState ?? '',
        file?.remoteState ?? '',
      ]),
    ),
  medium: (value) =>
    groupedTsv(
      [
        'wbkey',
        'version',
        'uri',
        'type',
        'name',
        'package_name',
        'file',
        'path',
        'local_state',
        'remote_state',
      ],
      stagingGroups(value.facts, (object, file) => [
        object.wbkey,
        object.version,
        object.uri,
        object.type,
        object.name,
        object.packageName,
        file?.name ?? '',
        file?.path ?? '',
        file?.localState ?? '',
        file?.remoteState ?? '',
      ]),
    ),
  full: facts,
});

/** R8, a run's log: each object's result. */
export const RUN_LOG_ANSWERS: AnswerTable<
  IAbapGitFactsResponse<IAbapGitObjectsFacts>,
  string
> = table({
  terse: (value) =>
    tsv(
      ['type', 'name', 'message_type'],
      value.facts.objects.map((object) => [
        object.type,
        object.name,
        object.messageType,
      ]),
    ),
  medium: (value) =>
    tsv(
      ['type', 'name', 'package', 'status', 'message_type'],
      value.facts.objects.map((object) => [
        object.type,
        object.name,
        object.package,
        object.status,
        object.messageType,
      ]),
    ),
  full: facts,
});

/** A write's result: `accepted` when SAP took it as its own job (`202`, cloud), else `done`. */
function resultOf(status: number): 'accepted' | 'done' {
  return status === 202 ? 'accepted' : 'done';
}

/**
 * What a write answers that SAP answers with no document (R10, R11, R15):
 * its status and its result. Minified JSON.
 */
export function statusAnswer(value: { readonly status: number }): string {
  return JSON.stringify({
    status: value.status,
    result: resultOf(value.status),
  });
}

/**
 * What a link or a pull answers (R2, R4): its status, its result and the
 * objects SAP's answer lists, when it lists any. Minified JSON.
 */
export function objectsAnswer(
  value: IAbapGitFactsResponse<IAbapGitObjectsFacts>,
): string {
  return JSON.stringify({
    status: value.status,
    result: resultOf(value.status),
    ...(value.facts.objects.length > 0 ? { objects: value.facts.objects } : {}),
  });
}
