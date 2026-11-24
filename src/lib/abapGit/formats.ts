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
  about,
  type Column,
  entries,
  headShape,
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
  { name: 'key', means: 'its key', cell: (repo) => repo.key },
  { name: 'package', means: 'its package', cell: (repo) => repo.package },
  { name: 'branch_name', means: 'its branch', cell: (repo) => repo.branchName },
  { name: 'url', means: 'its remote URL', cell: (repo) => repo.url },
  {
    name: 'run_status',
    means:
      'the state of its last pull or push on the cloud (blank initial, R running, S, W, E or A ended)',
    cell: (repo) => repo.runStatus ?? '',
  },
];

/** R1 at terse: each repository by its identifying columns. */
export const REPOS_TERSE: RowSchemas<IAbapGitReposFacts> = {
  repos: about(
    'for each repository linked',
    rows('repos', { columns: REPO_COLUMNS, header: 'always' }),
  ),
};

/** R1 at medium: each repository with its run's text and log. */
export const REPOS_MEDIUM: RowSchemas<IAbapGitReposFacts> = {
  repos: about(
    'for each repository linked',
    rows('repos', {
      columns: [
        ...REPO_COLUMNS,
        {
          name: 'status_text',
          means: 'the text of its last run',
          cell: (repo) => repo.statusText ?? '',
        },
        {
          name: 'app_log_key',
          means: 'the key of its run log',
          cell: (repo) => repo.appLogKey ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** R1, the repository list: every repository a row, by the listing writer. */
export const REPOS_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitReposFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: REPOS_TERSE }),
  medium: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: REPOS_MEDIUM }),
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

/** The heads R13 and R14 write: the repository's access mode. */
export const ACCESS_MODE_HEADS = [
  headShape(
    'access_mode',
    'whether the remote repository is public or private',
  ),
];

/** R13 at terse: each branch by its name and whether it is the head. */
export const EXTERNAL_REPO_TERSE: RowSchemas<IAbapGitExternalRepoFacts> = {
  branches: about(
    'for each branch of the remote repository',
    rows('branches', {
      columns: [
        {
          name: 'name',
          means: 'its name',
          cell: (branch: Branch) => branch.name,
        },
        {
          name: 'is_head',
          means: 'whether it is the head',
          cell: (branch: Branch) => yesNo(branch.isHead),
        },
      ],
      header: 'always',
    }),
  ),
};

/** R13 at medium: each branch with its type and commit. */
export const EXTERNAL_REPO_MEDIUM: RowSchemas<IAbapGitExternalRepoFacts> = {
  branches: about(
    'for each branch of the remote repository',
    rows('branches', {
      columns: [
        {
          name: 'name',
          means: 'its name',
          cell: (branch: Branch) => branch.name,
        },
        {
          name: 'type',
          means: 'its type',
          cell: (branch: Branch) => branch.type,
        },
        {
          name: 'is_head',
          means: 'whether it is the head',
          cell: (branch: Branch) => yesNo(branch.isHead),
        },
        {
          name: 'sha1',
          means: 'its commit',
          cell: (branch: Branch) => branch.sha1,
        },
      ],
      header: 'always',
    }),
  ),
};

/** R13, an external repository's branches: each a row, under its access mode. */
export const EXTERNAL_REPO_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitExternalRepoFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: EXTERNAL_REPO_TERSE,
    }),
  medium: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: EXTERNAL_REPO_MEDIUM,
    }),
  full: facts,
});

/** R14 at terse: the branch by its name and folder logic. */
export const BRANCH_INFO_TERSE: RowSchemas<IAbapGitBranchInfoFacts> = {
  branches: about(
    'for the branch',
    rows('branches', {
      columns: [
        {
          name: 'name',
          means: 'its name',
          cell: (branch: InfoBranch) => branch.name,
        },
        {
          name: 'folder_logic',
          means: 'how its folders map to packages',
          cell: (branch: InfoBranch) => branch.folderLogic,
        },
      ],
      header: 'always',
    }),
  ),
};

/** R14 at medium: the branch with its type, head and commit. */
export const BRANCH_INFO_MEDIUM: RowSchemas<IAbapGitBranchInfoFacts> = {
  branches: about(
    'for the branch',
    rows('branches', {
      columns: [
        {
          name: 'name',
          means: 'its name',
          cell: (branch: InfoBranch) => branch.name,
        },
        {
          name: 'type',
          means: 'its type',
          cell: (branch: InfoBranch) => branch.type,
        },
        {
          name: 'is_head',
          means: 'whether it is the head',
          cell: (branch: InfoBranch) => yesNo(branch.isHead),
        },
        {
          name: 'sha1',
          means: 'its commit',
          cell: (branch: InfoBranch) => branch.sha1,
        },
        {
          name: 'folder_logic',
          means: 'how its folders map to packages',
          cell: (branch: InfoBranch) => branch.folderLogic,
        },
      ],
      header: 'always',
    }),
  ),
};

/** R14, one branch with its folder logic, under its access mode. */
export const BRANCH_INFO_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitBranchInfoFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: BRANCH_INFO_TERSE,
    }),
  medium: (value) =>
    writeListing({
      heads: accessMode(value.facts),
      reading: value.facts,
      lists: BRANCH_INFO_MEDIUM,
    }),
  full: facts,
});

/** R6's two lists, each under its `# list` line, every object a row of `columns`. */
function modifiedSchemas(
  columns: Column<IAbapGitModifiedObject>[],
  besides: string,
): RowSchemas<IAbapGitModifiedObjectsFacts> {
  return {
    overwriteObjects: about(
      `for each object a pull would overwrite${besides}`,
      rows('overwriteObjects', {
        heading: { head: 'list', value: 'overwrite' },
        columns,
        header: 'when-rows',
      }),
    ),
    packageWarningObjects: about(
      `for each object a pull would move to another package${besides}`,
      rows('packageWarningObjects', {
        heading: { head: 'list', value: 'package_warning' },
        columns,
        header: 'when-rows',
      }),
    ),
  };
}

/** A modified object's identifying columns. */
const MODIFIED_COLUMNS: Column<IAbapGitModifiedObject>[] = [
  { name: 'type', means: 'its type', cell: (object) => object.type },
  { name: 'name', means: 'its name', cell: (object) => object.name },
  {
    name: 'package_name',
    means: 'its package',
    cell: (object) => object.packageName,
  },
];

/** R6 at terse and at medium. */
export const MODIFIED_TERSE = modifiedSchemas(MODIFIED_COLUMNS, '');
export const MODIFIED_MEDIUM = modifiedSchemas(
  [
    ...MODIFIED_COLUMNS,
    {
      name: 'action',
      means:
        'what the pull would do to it (1 add, 2 update, 3 overwrite, 4 delete, 5 delete and re-create, 6 package move)',
      cell: (object) => String(object.action),
    },
    { name: 'uri', means: 'its address', cell: (object) => object.uri },
  ],
  '',
);

/** R6, what a pull would overwrite. */
export const MODIFIED_OBJECTS_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitModifiedObjectsFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: MODIFIED_TERSE }),
  medium: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: MODIFIED_MEDIUM }),
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
export interface StagingRows {
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
export const stagingRows = (value: IAbapGitStagingFacts): StagingRows => ({
  unstaged: stagedRows(value.unstaged),
  staged: stagedRows(value.staged),
  ignored: stagedRows(value.ignored),
});

/** R9's three lists, each under its `# list` line: every row of `columns`. */
function stagingSchemas(
  columns: Column<StagedRow>[],
  besides: string,
): RowSchemas<StagingRows> {
  const list = <K extends keyof StagingRows>(key: K, noun: string) =>
    about(
      `${noun}${besides}`,
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
              'an object with several files is named once for each of its files',
            ),
          }),
        },
      }),
    );
  return {
    unstaged: list('unstaged', 'for each changed file left unstaged'),
    staged: list('staged', 'for each staged file'),
    ignored: list('ignored', 'for each ignored file'),
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

/** The heads R9 writes: SAP's proposed author and committer. */
export const STAGING_HEADS = [
  headShape('author', 'the author'),
  headShape('committer', 'the committer'),
];

/** What the staging heads' sentence says after them: SAP proposes both. */
export const STAGING_HEADS_BY = 'SAP proposes';

/** A staged row's identifying columns. */
const STAGED_COLUMNS: Column<StagedRow>[] = [
  { name: 'type', means: "its object's type", cell: (row) => row.object.type },
  { name: 'name', means: "its object's name", cell: (row) => row.object.name },
  {
    name: 'package_name',
    means: "its object's package",
    cell: (row) => row.object.packageName,
  },
  { name: 'file', means: 'its file name', cell: (row) => row.file?.name ?? '' },
];

/** The state columns of a staged row. */
const STATE_COLUMNS: Column<StagedRow>[] = [
  {
    name: 'local_state',
    means: 'its state in the system',
    cell: (row) => row.file?.localState ?? '',
  },
  {
    name: 'remote_state',
    means: 'its state in the remote',
    cell: (row) => row.file?.remoteState ?? '',
  },
];

/** R9 at terse and at medium. */
export const STAGING_TERSE = stagingSchemas(
  [...STAGED_COLUMNS, ...STATE_COLUMNS],
  '',
);
export const STAGING_MEDIUM = stagingSchemas(
  [
    {
      name: 'wbkey',
      means: "its object's workbench key",
      cell: (row) => row.object.wbkey,
    },
    {
      name: 'version',
      means: "its object's version",
      cell: (row) => row.object.version,
    },
    {
      name: 'uri',
      means: "its object's address",
      cell: (row) => row.object.uri,
    },
    ...STAGED_COLUMNS,
    { name: 'path', means: 'its folder', cell: (row) => row.file?.path ?? '' },
    ...STATE_COLUMNS,
  ],
  '',
);

/** R9, the staging: SAP's proposed author and committer, then what changed. */
export const STAGING_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitStagingFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({
      heads: people(value.facts),
      reading: stagingRows(value.facts),
      lists: STAGING_TERSE,
    }),
  medium: (value) =>
    writeListing({
      heads: people(value.facts),
      reading: stagingRows(value.facts),
      lists: STAGING_MEDIUM,
    }),
  full: facts,
});

/** A run log's object. */
type LoggedObject = IAbapGitObjectsFacts['objects'][number];

/** A logged object's identifying columns. */
const LOGGED_COLUMNS: Column<LoggedObject>[] = [
  { name: 'type', means: 'its type', cell: (object) => object.type },
  { name: 'name', means: 'its name', cell: (object) => object.name },
];

/** The column of a logged object's verdict. */
const MESSAGE_TYPE: Column<LoggedObject> = {
  name: 'message_type',
  means: "the severity of SAP's message for it (S, I, W, E or A)",
  cell: (object) => object.messageType,
};

/** R8 at terse: each object by type, name and the severity of its result. */
export const RUN_LOG_TERSE: RowSchemas<IAbapGitObjectsFacts> = {
  objects: about(
    'for each object the run handled',
    rows('objects', {
      columns: [...LOGGED_COLUMNS, MESSAGE_TYPE],
      header: 'always',
    }),
  ),
};

/** R8 at medium: each object with its package and status. */
export const RUN_LOG_MEDIUM: RowSchemas<IAbapGitObjectsFacts> = {
  objects: about(
    'for each object the run handled',
    rows('objects', {
      columns: [
        ...LOGGED_COLUMNS,
        {
          name: 'package',
          means: 'its package',
          cell: (object) => object.package,
        },
        {
          name: 'status',
          means: 'its status',
          cell: (object) => object.status,
        },
        MESSAGE_TYPE,
      ],
      header: 'always',
    }),
  ),
};

/** R8, a run's log: each object's result a row. */
export const RUN_LOG_ANSWERS: ListAnswerTable<
  IAbapGitFactsResponse<IAbapGitObjectsFacts>,
  string
> = table({
  terse: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: RUN_LOG_TERSE }),
  medium: (value) =>
    writeListing({ heads: [], reading: value.facts, lists: RUN_LOG_MEDIUM }),
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
  const answered: StatusAnswer = {
    status: value.status,
    result: resultOf(value.status),
  };
  return JSON.stringify(answered);
}

/** What `statusAnswer` writes: SAP's status, and whether it is done or accepted. */
export interface StatusAnswer {
  readonly status: number;
  readonly result: ReturnType<typeof resultOf>;
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
