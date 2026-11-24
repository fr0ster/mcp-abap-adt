/**
 * Plan step 10.5: a tool's description and its output, tied
 * (`returnsMatch.ts`). The writer tools are tied as each moves (group (2) of
 * step 10.7); until then each is listed in `NOT_YET_ASSEMBLED`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { abapGitFacts } from '@mcp-abap-adt/adt-strategies';
import { TOOL_DEFINITION as BRANCH_INFO } from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import { TOOL_DEFINITION as EXTERNAL_REPO } from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import { TOOL_DEFINITION as ERROR_LOG } from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import { TOOL_DEFINITION as MODIFIED } from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import { TOOL_DEFINITION as STAGING } from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import { TOOL_DEFINITION as REPOS } from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import { TOOL_DEFINITION as LIST_GROUP_INCLUDES } from '../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { TOOL_DEFINITION as LIST_FUNCTION_MODULES } from '../../../handlers/function_include/readonly/handleListFunctionModules';
import {
  TOOL_DEFINITION as GET_INCLUDES,
  INCLUDES_HEADS,
  INCLUDES_LISTS,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import {
  TOOL_DEFINITION as GET_PACKAGE,
  PACKAGE_HEADS,
  PACKAGE_MEDIUM,
  PACKAGE_TERSE,
  packageHeads,
} from '../../../handlers/package/high/handleGetPackage';
import {
  ACCESS_MODE_HEADS,
  BRANCH_INFO_MEDIUM,
  BRANCH_INFO_TERSE,
  EXTERNAL_REPO_MEDIUM,
  EXTERNAL_REPO_TERSE,
  MODIFIED_MEDIUM,
  MODIFIED_TERSE,
  REPOS_MEDIUM,
  REPOS_TERSE,
  RUN_LOG_MEDIUM,
  RUN_LOG_TERSE,
  STAGING_HEADS,
  STAGING_HEADS_BY,
  STAGING_MEDIUM,
  STAGING_TERSE,
  stagingRows,
} from '../../../lib/abapGit/formats';
import {
  partsOfDescription,
  type ReturnsFact,
  returnsOf,
} from '../../../lib/description';
import {
  about,
  entries,
  type Head,
  type HeadShape,
  headShape,
  type JsonSchemas,
  jsonShapesOf,
  kinds,
  marks,
  type RowSchemas,
  rows,
  shapesOf,
  type Line as WrittenLine,
  writeJson,
  writtenLines,
} from '../../../lib/detail';
import {
  GROUP_CHILD_HEADS,
  type GroupChild,
  groupChildLists,
} from '../../../lib/strategies/functionGroupChildren';
import { packageDetails } from '../../../lib/strategies/packageSummary';
import {
  externalRepo,
  modifiedObjects,
  objectResults,
  reposDocument,
  stagingEveryList,
} from '../../helpers/abapGitSap';
import { corpusBody } from '../../helpers/adtCorpus';
import { NOT_YET_ASSEMBLED, WRITER_TOOLS } from './notYetAssembled';
import { type ReturnsTie, type TieSample, tieFaults } from './returnsMatch';

/** Each tied tool's description, as its definition holds it. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  ListAbapGitRepos: REPOS.description,
  CheckAbapGitExternalRepo: EXTERNAL_REPO.description,
  GetAbapGitBranchInfo: BRANCH_INFO.description,
  GetAbapGitModifiedObjects: MODIFIED.description,
  GetAbapGitStaging: STAGING.description,
  GetAbapGitErrorLog: ERROR_LOG.description,
  GetPackage: GET_PACKAGE.description,
  GetIncludesList: GET_INCLUDES.description,
  ListFunctionModules: LIST_FUNCTION_MODULES.description,
  ListFunctionGroupIncludes: LIST_GROUP_INCLUDES.description,
};
const descriptionOf = (tool: string): string => DESCRIPTIONS[tool] ?? '';

/** An answer of SAP, as the abapGit reducers take it. */
const answered = (data: string) => ({
  status: 200,
  statusText: 'OK',
  headers: {},
  data,
});

/**
 * An abapGit read's tie: its terse and medium lists (both written as rows),
 * its heads, its served Returns, and its fixture's lines at both levels.
 */
function abapGitTie(
  tool: string,
  heads: readonly HeadShape[],
  terse: Parameters<typeof shapesOf>[0],
  medium: Parameters<typeof shapesOf>[0],
  samples: readonly TieSample[],
  by?: string,
): ReturnsTie {
  const parts = partsOfDescription(descriptionOf(tool));
  assert.ok(parts !== undefined, `${tool} is assembled`);
  return {
    terse: shapesOf(terse),
    heads,
    by,
    returns: parts.returns,
    samples,
  };
}

/**
 * A function group children tool's tie: one named child with its
 * description, and one SAP listed without a name, told apart by its URI.
 */
function groupChildTie(
  tool: string,
  listKey: 'function_modules' | 'includes',
): ReturnsTie {
  const parts = partsOfDescription(descriptionOf(tool));
  assert.ok(parts !== undefined, `${tool} is assembled`);
  const objects: GroupChild[] = [
    { name: 'Z_FM_A', type: 'FUGR/FF', description: 'First' },
    { name: '', type: 'FUGR/FF', uri: '/sap/bc/adt/x' },
  ];
  const reading = { objects };
  return {
    terse: shapesOf(groupChildLists(listKey)),
    heads: GROUP_CHILD_HEADS,
    returns: parts.returns,
    samples: [
      {
        reading,
        lines: writtenLines({
          heads: [
            { head: 'function_group', value: 'ZFG' },
            { head: 'total', value: '2' },
          ],
          reading,
          lists: groupChildLists(listKey),
        }),
      },
    ],
  };
}

/** Both levels' lines of one reading, each written by its schemas. */
const bothLevels = (
  reading: unknown,
  terse: readonly WrittenLine[],
  _medium: readonly WrittenLine[],
): TieSample[] => [{ reading, lines: terse }];

/** The writer tools tied so far, by name. */
const TIED: Readonly<Record<string, () => ReturnsTie>> = {
  ListFunctionModules: () =>
    groupChildTie('ListFunctionModules', 'function_modules'),
  ListFunctionGroupIncludes: () =>
    groupChildTie('ListFunctionGroupIncludes', 'includes'),
  GetIncludesList: () => {
    const parts = partsOfDescription(descriptionOf('GetIncludesList'));
    assert.ok(parts !== undefined);
    // A tree with an include met twice and one including itself, and an
    // include SAP could not read.
    const reading = {
      object_name: 'ZPROG',
      object_type: 'PROG/P',
      tree: {
        name: 'ZPROG',
        children: [
          {
            name: 'ZINC_A',
            children: [{ name: 'ZINC_A', cyclic: true, children: [] }],
          },
          { name: 'ZINC_B', children: [] },
          { name: 'ZINC_B', duplicate: true, children: [] },
        ],
      },
      unreadable: [{ name: 'ZINC_GONE' }],
    };
    return {
      terse: shapesOf(INCLUDES_LISTS),
      heads: INCLUDES_HEADS,
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({
            heads: [{ head: 'object', value: 'PROG/P ZPROG' }],
            reading,
            lists: INCLUDES_LISTS,
          }),
        },
      ],
    };
  },
  ListAbapGitRepos: () =>
    abapGitTie(
      'ListAbapGitRepos',
      [],
      REPOS_TERSE,
      REPOS_MEDIUM,
      (() => {
        const reading = abapGitFacts.reposFacts(answered(reposDocument)).facts;
        const heads: Head[] = [];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: REPOS_TERSE }),
          writtenLines({ heads, reading, lists: REPOS_MEDIUM }),
        );
      })(),
    ),
  CheckAbapGitExternalRepo: () => {
    const facts = abapGitFacts.externalRepoFacts(
      answered(externalRepo()),
    ).facts;
    return abapGitTie(
      'CheckAbapGitExternalRepo',
      ACCESS_MODE_HEADS,
      EXTERNAL_REPO_TERSE,
      EXTERNAL_REPO_MEDIUM,
      (() => {
        const reading = facts;
        const heads = [{ head: 'access_mode', value: facts.accessMode }];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: EXTERNAL_REPO_TERSE }),
          writtenLines({ heads, reading, lists: EXTERNAL_REPO_MEDIUM }),
        );
      })(),
    );
  },
  GetAbapGitBranchInfo: () => {
    const facts = abapGitFacts.branchInfo(
      answered(externalRepo({ folderLogic: true })),
    ).facts;
    return abapGitTie(
      'GetAbapGitBranchInfo',
      ACCESS_MODE_HEADS,
      BRANCH_INFO_TERSE,
      BRANCH_INFO_MEDIUM,
      (() => {
        const reading = facts;
        const heads = [{ head: 'access_mode', value: facts.accessMode }];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: BRANCH_INFO_TERSE }),
          writtenLines({ heads, reading, lists: BRANCH_INFO_MEDIUM }),
        );
      })(),
    );
  },
  GetAbapGitModifiedObjects: () =>
    abapGitTie(
      'GetAbapGitModifiedObjects',
      [],
      MODIFIED_TERSE,
      MODIFIED_MEDIUM,
      (() => {
        const reading = abapGitFacts.modifiedObjects(
          answered(modifiedObjects),
        ).facts;
        const heads: Head[] = [];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: MODIFIED_TERSE }),
          writtenLines({ heads, reading, lists: MODIFIED_MEDIUM }),
        );
      })(),
    ),
  GetAbapGitStaging: () =>
    abapGitTie(
      'GetAbapGitStaging',
      STAGING_HEADS,
      STAGING_TERSE,
      STAGING_MEDIUM,
      (() => {
        const reading = stagingRows(
          abapGitFacts.staging(answered(stagingEveryList)).facts,
        );
        const heads: Head[] = [
          { head: 'author', value: 'Ada' },
          { head: 'committer', value: 'Carl' },
        ];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: STAGING_TERSE }),
          writtenLines({ heads, reading, lists: STAGING_MEDIUM }),
        );
      })(),
      STAGING_HEADS_BY,
    ),
  GetPackage: () => {
    const parts = partsOfDescription(descriptionOf('GetPackage'));
    assert.ok(parts !== undefined);
    const samples = [
      corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
      // A package with every setting, its application component and
      // transport layer among them.
      '<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPKG" adtcore:description="A package" adtcore:type="DEVC/K" adtcore:responsible="DEVELOPER"><pak:attributes pak:packageType="development" pak:languageVersion="5"/><pak:superPackage adtcore:name="ZSUPER"/><pak:applicationComponent pak:name="BC-DWB"/><pak:transport><pak:softwareComponent pak:name="HOME"/><pak:transportLayer pak:name="ZDEV"/></pak:transport><pak:subPackages><pak:packageRef adtcore:name="ZSUB_A" adtcore:description="First"/></pak:subPackages></pak:package>',
    ].map((document) => {
      const read = packageDetails(document);
      return {
        reading: read,
        lines: writtenLines({
          heads: packageHeads('ZPKG', read),
          reading: read,
          lists: PACKAGE_TERSE,
        }),
        medium: writeJson({}, { metadata: read }, PACKAGE_MEDIUM).answer,
      };
    });
    return {
      terse: shapesOf(PACKAGE_TERSE),
      medium: jsonShapesOf(PACKAGE_MEDIUM),
      heads: PACKAGE_HEADS,
      of: 'its',
      returns: parts.returns,
      samples,
    };
  },
  GetAbapGitErrorLog: () =>
    abapGitTie(
      'GetAbapGitErrorLog',
      [],
      RUN_LOG_TERSE,
      RUN_LOG_MEDIUM,
      (() => {
        const reading = abapGitFacts.runLog(answered(objectResults)).facts;
        const heads: Head[] = [];
        return bothLevels(
          reading,
          writtenLines({ heads, reading, lists: RUN_LOG_TERSE }),
          writtenLines({ heads, reading, lists: RUN_LOG_MEDIUM }),
        );
      })(),
    ),
};

type Item = { readonly name: string; readonly type: string };
type Line =
  | { readonly kind: 'row'; readonly name: string }
  | { readonly kind: 'gone'; readonly name: string };
type Reading = {
  readonly objects: readonly Item[];
  readonly gone: readonly string[];
  readonly lines: readonly Line[];
};
const columns = [
  { name: 'type', means: 'its type', cell: (o: Item) => o.type },
  { name: 'name', means: 'its name', cell: (o: Item) => o.name },
];
const terse: RowSchemas<Reading> = {
  objects: about(
    'for each object',
    rows('objects', { columns, header: 'always' }),
  ),
  gone: about(
    'the objects SAP could not load',
    marks('gone', 'not_loaded', (name: string) => [name]),
  ),
  lines: about(
    'for each line kind',
    kinds<Line, 'lines', 'kind'>('lines', 'kind', {
      row: {
        row: {
          columns: [
            { name: 'line', means: 'its line', cell: (l: Line) => l.name },
          ],
          header: 'none',
        },
      },
      gone: { mark: 'gone_line', words: (l: Line) => [l.name] },
    }),
  ),
};
const medium: JsonSchemas<Reading> = {
  objects: about(
    'for each object',
    entries('objects', (o: Item) => o),
  ),
  gone: about(
    'the objects SAP could not load',
    entries('gone', (name: string) => ({ name })),
  ),
  lines: about(
    'for each line kind',
    entries('lines', (l: Line) => ({ name: l.name })),
  ),
};
const head = headShape('package', 'the package read');
const reading: Reading = {
  objects: [{ name: 'ZCL', type: 'CLAS/OC' }],
  gone: ['ZX'],
  lines: [
    { kind: 'row', name: 'L1' },
    { kind: 'gone', name: 'L2' },
  ],
};
const sampleOf = (value: Reading, lists: RowSchemas<Reading> = terse) => ({
  reading: value,
  lines: writtenLines({
    heads: [{ head: 'package', value: 'ZPKG' }],
    reading: value,
    lists,
  }),
});
const tie = (overrides: Partial<ReturnsTie> = {}): ReturnsTie => ({
  terse: shapesOf(terse),
  medium: jsonShapesOf(medium),
  heads: [head],
  returns: returnsOf({
    heads: [head],
    shapes: [shapesOf(terse), jsonShapesOf(medium)],
  }),
  samples: [
    {
      ...sampleOf(reading),
      medium: writeJson({}, reading, medium).answer,
    },
  ],
  ...overrides,
});

describe('a tool description tied to what its writers write', () => {
  it('holds when every list, kind, column, head and mark is reached and named', () => {
    assert.deepStrictEqual(tieFaults(tie()), []);
  });

  it('fails on an extra fact, and on a fact left out', () => {
    const [first, ...rest] = tie().returns;
    assert.ok(first !== undefined);
    assert.ok(
      tieFaults(tie({ returns: rest })).some((f) =>
        f.startsWith('a fact left out'),
      ),
    );
    const other = returnsOf({
      heads: [headShape('other', 'something else')],
      shapes: [],
    });
    assert.ok(
      tieFaults(tie({ returns: [...tie().returns, ...other] })).some((f) =>
        f.startsWith('an extra fact'),
      ),
    );
    // @ts-expect-error a fact is nominal: no spread of one is a fact.
    const forged: ReturnsFact = { ...first, text: 'Forged.' };
    void forged;
  });

  it('fails on a fact stated twice', () => {
    const [first] = tie().returns;
    assert.ok(first !== undefined);
    assert.ok(
      tieFaults(tie({ returns: [...tie().returns, first] })).includes(
        'a fact stated twice',
      ),
    );
  });

  it('fails on a written head no schema declares', () => {
    assert.ok(
      tieFaults(tie({ heads: [] })).some((f) =>
        f.includes('an undeclared head: "package"'),
      ),
    );
  });

  it('fails on a written header its schemas do not declare', () => {
    const faults = tieFaults(tie({ terse: shapesOf(terse).slice(1) }));
    assert.ok(
      faults.includes('an undeclared header: "type\tname"'),
      faults.join('\n'),
    );
  });

  it('fails on a kind row without the noun of its column', () => {
    const bare: RowSchemas<Reading> = {
      ...terse,
      lines: about(
        'for each line kind',
        kinds<Line, 'lines', 'kind'>(
          'lines',
          'kind',
          {
            row: {
              row: {
                columns: [{ name: 'line', cell: (l: Line) => l.name }],
                header: 'none',
              },
            },
            gone: { mark: 'gone_line', words: (l: Line) => [l.name] },
          },
          ['line'],
        ),
      ),
    };
    const faults = tieFaults(
      tie({
        terse: shapesOf(bare),
        samples: [sampleOf(reading, bare)],
      }),
    );
    assert.ok(
      faults.includes('the column "line" is written without its noun'),
      faults.join('\n'),
    );
  });

  it('fails on a headerless kind row without the noun of its column', () => {
    const bare: RowSchemas<Reading> = {
      ...terse,
      lines: about(
        'for each line kind',
        kinds<Line, 'lines', 'kind'>('lines', 'kind', {
          row: {
            row: {
              columns: [{ name: 'line', cell: (l: Line) => l.name }],
              header: 'none',
            },
          },
          gone: { mark: 'gone_line', words: (l: Line) => [l.name] },
        }),
      ),
    };
    const faults = tieFaults(
      tie({
        terse: shapesOf(bare),
        samples: [sampleOf(reading, bare)],
      }),
    );
    assert.ok(
      faults.includes('the column "line" of the kind "row" has no noun'),
      faults.join('\n'),
    );
  });

  it('a headerless kind row with its noun is stated in the Returns', () => {
    const facts = returnsOf({ shapes: [shapesOf(terse)] }).map(
      (each) => each.text,
    );
    assert.ok(
      facts.includes('For each line kind: its line.'),
      facts.join('\n'),
    );
  });

  it('fails on a medium list under an undeclared name', () => {
    const faults = tieFaults(
      tie({
        samples: [
          { ...sampleOf(reading), medium: { stray: [1], objects: [] } },
        ],
      }),
    );
    assert.ok(
      faults.includes('the medium list "stray" is under no declared name'),
      faults.join('\n'),
    );
  });

  it('fails on an array nested under no declared path, and on a declared medium list no fixture reaches', () => {
    const faults = tieFaults(
      tie({
        samples: [
          {
            ...sampleOf(reading),
            medium: { objects: [{ name: 'ZCL', stray: [1] }], lines: [] },
          },
        ],
      }),
    );
    assert.ok(
      faults.includes(
        'the medium list "objects[].stray" is under no declared name',
      ),
      faults.join('\n'),
    );
    assert.ok(
      faults.includes('no fixture reaches the medium list "gone"'),
      faults.join('\n'),
    );
  });

  it('fails on a list and a kind no fixture reaches', () => {
    const faults = tieFaults(
      tie({
        samples: [
          sampleOf({
            objects: reading.objects,
            gone: [],
            lines: [{ kind: 'row', name: 'L1' }],
          }),
        ],
      }),
    );
    assert.ok(
      faults.includes('no fixture reaches the list "gone"'),
      faults.join('\n'),
    );
    assert.ok(
      faults.includes('no fixture reaches the kind "lines/gone"'),
      faults.join('\n'),
    );
  });
});

describe('every writer tool is tied, or still listed as not yet assembled', () => {
  for (const tool of WRITER_TOOLS) {
    it(tool, () => {
      const tied = TIED[tool];
      if (tied === undefined) {
        assert.ok(
          NOT_YET_ASSEMBLED.has(tool),
          `${tool} is neither tied nor listed`,
        );
        return;
      }
      assert.ok(
        !NOT_YET_ASSEMBLED.has(tool),
        `${tool} is tied and still listed`,
      );
      assert.deepStrictEqual(tieFaults(tied()), []);
    });
  }
});
