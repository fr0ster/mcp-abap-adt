/**
 * What an abapGit read answers at each level of `detail` (spec §5.3): a
 * pure formatter of the facts adt-clients' reading kept (`abapGitFacts`),
 * selected before the call (`listAnswerAt(table, levelOf(args))`).
 *
 * - `terse`: TSV of the identifiers and a short description;
 * - `medium`: TSV of every fact field;
 * - `full`: the whole facts object, minified JSON.
 *
 * Terse and medium are written by the listing writer (plan step 9): every
 * item of every list of the facts one row, nothing chosen by a formatter.
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
import {
  type Column,
  entries,
  jsonText,
  type ListAnswerTable,
  omitted,
  type RowSchemas,
  rows,
  type Written,
  within,
  writeJson,
  writeListing,
} from '../detail';
import { levelWords } from '../strategies/detail';

/** The levels an abapGit read offers. */
export const ABAPGIT_DETAIL_LEVELS = ['terse', 'medium', 'full'] as const;

/** The `detail` field of an abapGit read's schema. */
export const ABAPGIT_DETAIL_SHAPE = {
  detail: z
    .enum(ABAPGIT_DETAIL_LEVELS)
    .optional()
    // The shared text over the levels an abapGit read offers (no raw).
    .describe(levelWords(ABAPGIT_DETAIL_LEVELS)),
};

/** A table whose `raw` writes as `full`: no abapGit tool offers `raw`. */
function table<V>(formats: {
  readonly terse: (value: V) => Written<string>;
  readonly medium: (value: V) => Written<string>;
  readonly full: (value: V) => string;
}): ListAnswerTable<V, string> {
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

/** A repository's identifying columns. */
const REPO_COLUMNS: Column<IAbapGitRepoFacts>[] = [
  { name: 'key', cell: (repo) => repo.key },
  { name: 'package', cell: (repo) => repo.package },
  { name: 'branch_name', cell: (repo) => repo.branchName },
  { name: 'url', cell: (repo) => repo.url },
  { name: 'run_status', cell: (repo) => repo.runStatus ?? '' },
];

/** R1, the repository list: every repository a row, by the listing writer. */
export const REPOS_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitReposFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: {
        repos: rows('repos', { columns: REPO_COLUMNS, header: 'always' }),
      },
    }),
  medium: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: {
        repos: rows('repos', {
          columns: [
            ...REPO_COLUMNS,
            { name: 'status_text', cell: (repo) => repo.statusText ?? '' },
            { name: 'app_log_key', cell: (repo) => repo.appLogKey ?? '' },
          ],
          header: 'always',
        }),
      },
    }),
  full: facts,
});

/** A branch as the external repository answers it. */
type Branch = IAbapGitExternalRepoFacts['branches'][number];

/** A branch with its folder logic, as the branch info answers it. */
type InfoBranch = IAbapGitBranchInfoFacts['branches'][number];

/** The access mode of an external repository, its head line. */
const accessMode = (value: { readonly accessMode: string }) => [
  { head: 'access_mode', value: value.accessMode },
];

/** R13, an external repository's branches: each a row, under its access mode. */
export const EXTERNAL_REPO_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitExternalRepoFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: {
        branches: rows('branches', {
          columns: [
            { name: 'name', cell: (branch: Branch) => branch.name },
            { name: 'is_head', cell: (branch: Branch) => yesNo(branch.isHead) },
          ],
          header: 'always',
        }),
      },
    }),
  medium: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: {
        branches: rows('branches', {
          columns: [
            { name: 'name', cell: (branch: Branch) => branch.name },
            { name: 'type', cell: (branch: Branch) => branch.type },
            { name: 'is_head', cell: (branch: Branch) => yesNo(branch.isHead) },
            { name: 'sha1', cell: (branch: Branch) => branch.sha1 },
          ],
          header: 'always',
        }),
      },
    }),
  full: facts,
});

/** R14, one branch with its folder logic, under its access mode. */
export const BRANCH_INFO_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitBranchInfoFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: {
        branches: rows('branches', {
          columns: [
            { name: 'name', cell: (branch: InfoBranch) => branch.name },
            {
              name: 'folder_logic',
              cell: (branch: InfoBranch) => branch.folderLogic,
            },
          ],
          header: 'always',
        }),
      },
    }),
  medium: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: {
        branches: rows('branches', {
          columns: [
            { name: 'name', cell: (branch: InfoBranch) => branch.name },
            { name: 'type', cell: (branch: InfoBranch) => branch.type },
            {
              name: 'is_head',
              cell: (branch: InfoBranch) => yesNo(branch.isHead),
            },
            { name: 'sha1', cell: (branch: InfoBranch) => branch.sha1 },
            {
              name: 'folder_logic',
              cell: (branch: InfoBranch) => branch.folderLogic,
            },
          ],
          header: 'always',
        }),
      },
    }),
  full: facts,
});

/** R6's two lists, each under its `# list` line, every object a row of `columns`. */
function modifiedSchemas(
  columns: Column<IAbapGitModifiedObject>[],
): RowSchemas<IAbapGitModifiedObjectsFacts> {
  return {
    overwriteObjects: rows('overwriteObjects', {
      heading: { head: 'list', value: 'overwrite' },
      columns,
      header: 'when-rows',
    }),
    packageWarningObjects: rows('packageWarningObjects', {
      heading: { head: 'list', value: 'package_warning' },
      columns,
      header: 'when-rows',
    }),
  };
}

/** A modified object's identifying columns. */
const MODIFIED_COLUMNS: Column<IAbapGitModifiedObject>[] = [
  { name: 'type', cell: (object) => object.type },
  { name: 'name', cell: (object) => object.name },
  { name: 'package_name', cell: (object) => object.packageName },
];

/** R6, what a pull would overwrite. */
export const MODIFIED_OBJECTS_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitModifiedObjectsFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: modifiedSchemas(MODIFIED_COLUMNS),
    }),
  medium: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: modifiedSchemas([
        ...MODIFIED_COLUMNS,
        { name: 'action', cell: (object) => String(object.action) },
        { name: 'uri', cell: (object) => object.uri },
      ]),
    }),
  full: facts,
});

/** A staged object's file. */
type StagedFile = IAbapGitStagedObject['files'][number];

/** One row of the staging: an object with one of its files, or alone when it has none. */
interface StagedRow {
  readonly object: IAbapGitStagedObject;
  readonly file: StagedFile | undefined;
}

/** R9's three lists, each every object once per file — an object without files once. */
interface StagingRows {
  readonly unstaged: readonly StagedRow[];
  readonly staged: readonly StagedRow[];
  readonly ignored: readonly StagedRow[];
}

/** Every object of a list, once per file: an object without files is one row. */
function stagedRows(objects: readonly IAbapGitStagedObject[]): StagedRow[] {
  return objects.flatMap((object): StagedRow[] =>
    object.files.length === 0
      ? [{ object, file: undefined }]
      : object.files.map((file) => ({ object, file })),
  );
}

/** The staging's rows: every object of every list, every file of it. */
const stagingRows = (value: IAbapGitStagingFacts): StagingRows => ({
  unstaged: stagedRows(value.unstaged),
  staged: stagedRows(value.staged),
  ignored: stagedRows(value.ignored),
});

/** R9's three lists, each under its `# list` line: every row of `columns`. */
function stagingSchemas(columns: Column<StagedRow>[]): RowSchemas<StagingRows> {
  const list = <K extends keyof StagingRows>(key: K) =>
    rows(key, {
      heading: { head: 'list', value: key },
      columns,
      header: 'when-rows',
      lists: {
        // The object's files are the rows themselves: one row per file
        // (`stagedRows`), its file columns.
        object: within<IAbapGitStagedObject, 'object'>('object', {
          files: omitted<StagedFile, 'files'>(
            'files',
            'each file of the object is a row of its own, by its file columns',
          ),
        }),
      },
    });
  return {
    unstaged: list('unstaged'),
    staged: list('staged'),
    ignored: list('ignored'),
  };
}

/** SAP's proposed author and committer, as head lines. */
const people = (value: IAbapGitStagingFacts) => [
  {
    head: 'author',
    value: `${value.author.name} <${value.author.email}>`,
  },
  {
    head: 'committer',
    value: `${value.committer.name} <${value.committer.email}>`,
  },
];

/** A staged row's identifying columns. */
const STAGED_COLUMNS: Column<StagedRow>[] = [
  { name: 'type', cell: (row) => row.object.type },
  { name: 'name', cell: (row) => row.object.name },
  { name: 'package_name', cell: (row) => row.object.packageName },
  { name: 'file', cell: (row) => row.file?.name ?? '' },
];

/** R9, the staging: SAP's proposed author and committer, then what changed. */
export const STAGING_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitStagingFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: people(value.facts),
      reading: stagingRows(value.facts),
      lists: stagingSchemas([
        ...STAGED_COLUMNS,
        { name: 'local_state', cell: (row) => row.file?.localState ?? '' },
        { name: 'remote_state', cell: (row) => row.file?.remoteState ?? '' },
      ]),
    }),
  medium: (value) =>
    writeListing({
      heads: people(value.facts),
      reading: stagingRows(value.facts),
      lists: stagingSchemas([
        { name: 'wbkey', cell: (row) => row.object.wbkey },
        { name: 'version', cell: (row) => row.object.version },
        { name: 'uri', cell: (row) => row.object.uri },
        ...STAGED_COLUMNS,
        { name: 'path', cell: (row) => row.file?.path ?? '' },
        { name: 'local_state', cell: (row) => row.file?.localState ?? '' },
        { name: 'remote_state', cell: (row) => row.file?.remoteState ?? '' },
      ]),
    }),
  full: facts,
});

/** A run log's object. */
type LoggedObject = IAbapGitObjectsFacts['objects'][number];

/** R8, a run's log: each object's result a row. */
export const RUN_LOG_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitObjectsFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: {
        objects: rows('objects', {
          columns: [
            { name: 'type', cell: (object: LoggedObject) => object.type },
            { name: 'name', cell: (object: LoggedObject) => object.name },
            {
              name: 'message_type',
              cell: (object: LoggedObject) => object.messageType,
            },
          ],
          header: 'always',
        }),
      },
    }),
  medium: (value) =>
    writeListing({
      heads: [],
      reading: value.facts,
      lists: {
        objects: rows('objects', {
          columns: [
            { name: 'type', cell: (object: LoggedObject) => object.type },
            { name: 'name', cell: (object: LoggedObject) => object.name },
            { name: 'package', cell: (object: LoggedObject) => object.package },
            { name: 'status', cell: (object: LoggedObject) => object.status },
            {
              name: 'message_type',
              cell: (object: LoggedObject) => object.messageType,
            },
          ],
          header: 'always',
        }),
      },
    }),
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
 * What a link or a pull answers (R2, R4): its status, its result and every
 * object SAP's answer lists, when it lists any — by the JSON writer.
 * Minified JSON.
 */
export function objectsAnswer(
  value: IAbapGitFactsResponse<IAbapGitObjectsFacts>,
): string {
  return jsonText(
    writeJson(
      { status: value.status, result: resultOf(value.status) },
      value.facts,
      {
        objects: entries('objects', (object: LoggedObject) => object, {
          omitEmpty: true,
        }),
      },
    ),
  ).answer;
}
