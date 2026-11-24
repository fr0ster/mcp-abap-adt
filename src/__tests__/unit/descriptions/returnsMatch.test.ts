/**
 * Plan step 10.5: a tool's description and its output, tied
 * (`returnsMatch.ts`). The writer tools are tied as each moves (group (2) of
 * step 10.7); until then each is listed in `NOT_YET_ASSEMBLED`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapTraceEntry,
  IInactiveObjectsResponse,
} from '@mcp-abap-adt/adt-strategies';
import { abapGitFacts } from '@mcp-abap-adt/adt-strategies';
import { TOOL_DEFINITION as BRANCH_INFO } from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import { TOOL_DEFINITION as EXTERNAL_REPO } from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import { TOOL_DEFINITION as ERROR_LOG } from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import { TOOL_DEFINITION as MODIFIED } from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import { TOOL_DEFINITION as STAGING } from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import { TOOL_DEFINITION as REPOS } from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import {
  TOOL_DEFINITION as ATC_FINDINGS,
  ATC_FINDINGS_HEADS,
} from '../../../handlers/atc/high/handleGetATCFindings';
import {
  TOOL_DEFINITION as ATC_RESULT,
  ATC_RESULT_HEADS,
} from '../../../handlers/atc/high/handleGetATCResult';
import {
  TOOL_DEFINITION as OBJECT_VERSIONS,
  VERSIONS_HEADS,
  VERSIONS_LISTS,
} from '../../../handlers/common/readonly/handleGetObjectVersions';
import { TOOL_DEFINITION as LIST_GROUP_INCLUDES } from '../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { TOOL_DEFINITION as LIST_FUNCTION_MODULES } from '../../../handlers/function_include/readonly/handleListFunctionModules';
import {
  TOOL_DEFINITION as GET_INCLUDES,
  INCLUDES_HEADS,
  INCLUDES_LISTS,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import {
  TOOL_DEFINITION as GET_MAIN_PROGRAMS,
  MAIN_PROGRAMS_HEADS,
  MAIN_PROGRAMS_LISTS,
} from '../../../handlers/include/readonly/handleGetMainPrograms';
import {
  TOOL_DEFINITION as GET_PACKAGE,
  PACKAGE_HEADS,
  PACKAGE_MEDIUM,
  PACKAGE_TERSE,
  packageHeads,
} from '../../../handlers/package/high/handleGetPackage';
import {
  CONTENTS_LISTS,
  TOOL_DEFINITION as PACKAGE_CONTENTS,
} from '../../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as OBJECTS_BY_TYPE,
  OBJECTS_BY_TYPE_HEADS,
  OBJECTS_BY_TYPE_LISTS,
} from '../../../handlers/search/readonly/handleGetObjectsByType';
import {
  TOOL_DEFINITION as OBJECTS_LIST,
  OBJECTS_LIST_HEADS,
  OBJECTS_LIST_LISTS,
  OBJECTS_LIST_OF,
} from '../../../handlers/search/readonly/handleGetObjectsList';
import {
  SEARCH_HITS_LISTS,
  TOOL_DEFINITION as SEARCH_OBJECT,
} from '../../../handlers/search/readonly/handleSearchObject';
import {
  TOOL_DEFINITION as PACKAGE_TREE,
  PACKAGE_TREE_LISTS,
} from '../../../handlers/system/high/handleGetPackageTree';
import {
  TOOL_DEFINITION as DESCRIBE_BY_LIST,
  DESCRIBED_LISTS,
} from '../../../handlers/system/readonly/handleDescribeByList';
import {
  TOOL_DEFINITION as ADT_TYPES,
  TYPES_HEADS,
  TYPES_LISTS,
} from '../../../handlers/system/readonly/handleGetAllTypes';
import {
  INACTIVE_HEADS,
  INACTIVE_LISTS,
  TOOL_DEFINITION as INACTIVE_OBJECTS,
} from '../../../handlers/system/readonly/handleGetInactiveObjects';
import {
  TOOL_DEFINITION as OUTLINE,
  OUTLINE_HEADS,
  outlineLists,
} from '../../../handlers/system/readonly/handleGetObjectOutline';
import {
  TOOL_DEFINITION as OBJECT_STRUCTURE,
  objectStructureLists,
} from '../../../handlers/system/readonly/handleGetObjectStructure';
import {
  TOOL_DEFINITION as TRANSACTION,
  TRANSACTION_HEADS,
  TRANSACTION_LISTS,
} from '../../../handlers/system/readonly/handleGetTransaction';
import {
  TOOL_DEFINITION as WHERE_USED,
  WHERE_USED_HEADS,
  WHERE_USED_LISTS,
} from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  TOOL_DEFINITION as GATEWAY_ERRORS,
  GATEWAY_ERRORS_HEADS,
  GATEWAY_ERRORS_LISTS,
} from '../../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import {
  TOOL_DEFINITION as TRACE_FILES,
  TRACE_FILES_HEADS,
  TRACE_FILES_LISTS,
} from '../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import {
  TOOL_DEFINITION as SYSTEM_MESSAGES,
  SYSTEM_MESSAGES_HEADS,
  SYSTEM_MESSAGES_LISTS,
} from '../../../handlers/system/readonly/handleRuntimeListSystemMessages';
import {
  TOOL_DEFINITION as SEARCH_SOURCE,
  SEARCH_SOURCE_HEADS,
  SEARCH_SOURCE_LISTS,
} from '../../../handlers/system/readonly/handleSearchSource';
import {
  TOOL_DEFINITION as TRANSPORTS,
  TRANSPORTS_HEADS,
  TRANSPORTS_LISTS,
} from '../../../handlers/transport/readonly/handleListTransports';
import {
  TOOL_DEFINITION as ACTION_LOG,
  ACTION_LOG_HEADS,
  ACTION_LOG_LISTS,
} from '../../../handlers/transport/readonly/handleReadTransportActionLog';
import {
  TOOL_DEFINITION as TRANSPORT_OBJECTS,
  TRANSPORT_OBJECTS_HEADS,
  TRANSPORT_OBJECTS_LISTS,
} from '../../../handlers/transport/readonly/handleReadTransportObjects';
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
  omitting,
  type RowSchemas,
  rows,
  shapesOf,
  type Line as WrittenLine,
  writeJson,
  writtenLines,
} from '../../../lib/detail';
import { FINDINGS_LISTS } from '../../../lib/strategies/atcFindings';
import {
  GROUP_CHILD_HEADS,
  type GroupChild,
  groupChildLists,
} from '../../../lib/strategies/functionGroupChildren';
import { packageDetails } from '../../../lib/strategies/packageSummary';
import type { PackageNode } from '../../../lib/strategies/packageWalk';
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
  GetMainPrograms: GET_MAIN_PROGRAMS.description,
  SearchSource: SEARCH_SOURCE.description,
  SearchObject: SEARCH_OBJECT.description,
  DescribeByList: DESCRIBE_BY_LIST.description,
  GetWhereUsed: WHERE_USED.description,
  GetObjectsList: OBJECTS_LIST.description,
  GetObjectsByType: OBJECTS_BY_TYPE.description,
  GetAdtTypes: ADT_TYPES.description,
  GetPackageContents: PACKAGE_CONTENTS.description,
  GetInactiveObjects: INACTIVE_OBJECTS.description,
  GetObjectVersions: OBJECT_VERSIONS.description,
  GetTransaction: TRANSACTION.description,
  GetPackageTree: PACKAGE_TREE.description,
  ReadTransportObjects: TRANSPORT_OBJECTS.description,
  ListTransports: TRANSPORTS.description,
  ReadTransportActionLog: ACTION_LOG.description,
  RuntimeListSystemMessages: SYSTEM_MESSAGES.description,
  RuntimeGetGatewayErrorLog: GATEWAY_ERRORS.description,
  RuntimeListProfilerTraceFiles: TRACE_FILES.description,
  GetATCFindings: ATC_FINDINGS.description,
  GetATCResult: ATC_RESULT.description,
  GetObjectOutline: OUTLINE.description,
  GetObjectStructure: OBJECT_STRUCTURE.description,
};

/** An ATC tool's tie: one finding, under the heads the tool writes. */
function atcTie(
  tool: string,
  heads: readonly HeadShape[],
  written: readonly Head[],
): ReturnsTie {
  const reading = {
    findings: [
      {
        object: 'ZCL_A',
        object_type: 'CLAS',
        location: 'ZCL_A=======CM001',
        line: 3,
        column: 2,
        priority: 1,
        check: 'Syntax',
        message: 'An error',
      },
    ],
  };
  return writtenTie(tool, [FINDINGS_LISTS], heads, [
    {
      reading,
      lines: writtenLines({
        heads: [...written, { head: 'priority', value: '1 1' }],
        reading,
        lists: FINDINGS_LISTS,
      }),
    },
  ]);
}

/** A writer tool's tie: its lists (every variant), its heads, its fixtures' lines. */
function writtenTie(
  tool: string,
  variants: readonly Parameters<typeof shapesOf>[0][],
  heads: readonly HeadShape[],
  samples: readonly TieSample[],
  of?: string,
): ReturnsTie {
  const parts = partsOfDescription(descriptionOf(tool));
  assert.ok(parts !== undefined, `${tool} is assembled`);
  return {
    terse: variants.flatMap(shapesOf),
    heads,
    of,
    returns: parts.returns,
    samples,
  };
}

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
  GetObjectOutline: () => {
    // A class with a method in its own include and one in a local include.
    const at = (source: string, line: number) => ({
      rel: 'definitionIdentifier',
      source,
      start: { line, column: 0 },
    });
    const reading = {
      tree: [
        {
          name: 'ZCL_A',
          type: 'CLAS/OC',
          links: [at('/sap/bc/adt/oo/classes/zcl_a/source/main', 1)],
          children: [
            {
              name: 'RUN',
              type: 'CLAS/OM',
              visibility: 'public',
              links: [at('/sap/bc/adt/oo/classes/zcl_a/source/main', 3)],
              children: [],
            },
            {
              name: 'LCL',
              type: 'CLAS/OCL',
              links: [
                at('/sap/bc/adt/oo/classes/zcl_a/includes/implementations', 1),
              ],
              children: [],
            },
          ],
        },
      ],
    };
    const source = '/sap/bc/adt/oo/classes/zcl_a/source/main';
    const heads = [
      { head: 'object', value: 'CLAS/OC ZCL_A' },
      { head: 'source', value: source },
    ];
    return writtenTie(
      'GetObjectOutline',
      [outlineLists(undefined)],
      OUTLINE_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: outlineLists(source) }),
        },
      ],
    );
  },
  GetObjectStructure: () => {
    const reading = {
      tree: [
        {
          objecttype: 'DDLS/DF',
          objectname: 'ZI_A',
          isfolder: false,
          synthetic: true as const,
          children: [
            {
              objecttype: 'DDLS/DFE',
              objectname: 'FIELD',
              isfolder: false,
              children: [],
            },
          ],
        },
      ],
    };
    return writtenTie(
      'GetObjectStructure',
      [objectStructureLists(false)],
      [],
      [
        {
          reading,
          lines: writtenLines({
            heads: [],
            reading,
            lists: objectStructureLists(false),
          }),
        },
      ],
    );
  },
  GetATCFindings: () =>
    atcTie('GetATCFindings', ATC_FINDINGS_HEADS, [
      { head: 'worklist', value: 'W1' },
      { head: 'objects_checked', value: '0' },
      { head: 'finding_count', value: '1' },
      { head: 'note', value: 'empty' },
    ]),
  GetATCResult: () =>
    atcTie('GetATCResult', ATC_RESULT_HEADS, [
      { head: 'result', value: 'R1' },
      { head: 'title', value: 'A run' },
      { head: 'check_variant', value: 'DEFAULT' },
      { head: 'created_at', value: '2026-01-01' },
      { head: 'objects_checked', value: '1' },
      { head: 'finding_count', value: '1' },
    ]),
  RuntimeListSystemMessages: () => {
    const reading = {
      messages: [
        {
          id: 'M1',
          createdOn: '2026-01-01',
          author: 'ADMIN',
          title: 'Downtime',
        },
      ],
    };
    const heads = [{ head: 'count', value: '1' }];
    return writtenTie(
      'RuntimeListSystemMessages',
      [SYSTEM_MESSAGES_LISTS],
      SYSTEM_MESSAGES_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: SYSTEM_MESSAGES_LISTS }),
        },
      ],
    );
  },
  RuntimeGetGatewayErrorLog: () => {
    const reading = {
      errors: [
        {
          opid: 'OP1',
          detailUri: '/sap/bc/adt/gw/errorlog/Frontend/OP1',
          dateTime: '2026-01-01T00:00:00Z',
          type: 'Frontend',
          shortText: 'Failed',
          username: 'DEV',
        },
      ],
    };
    const heads = [{ head: 'count', value: '1' }];
    return writtenTie(
      'RuntimeGetGatewayErrorLog',
      [GATEWAY_ERRORS_LISTS],
      GATEWAY_ERRORS_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: GATEWAY_ERRORS_LISTS }),
        },
      ],
    );
  },
  RuntimeListProfilerTraceFiles: () => {
    const reading: { entries: IAbapTraceEntry[] } = {
      entries: [
        {
          id: 'T1',
          recordedAt: '2026-01-01T00:00:00Z',
          user: 'DEV',
          objectName: 'ZPROG',
          state: { value: 'R', text: 'Ready' },
          expiresAt: '2026-02-01T00:00:00Z',
          system: 'DEV',
          client: '001',
          host: 'h',
          size: 1,
          runtime: 10,
          runtimeABAP: 5,
          runtimeSystem: 3,
          runtimeDatabase: 2,
          isAggregated: false,
          amdpFileSize: 0,
        },
      ],
    };
    const heads = [{ head: 'count', value: '1' }];
    return writtenTie(
      'RuntimeListProfilerTraceFiles',
      [TRACE_FILES_LISTS],
      TRACE_FILES_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: TRACE_FILES_LISTS }),
        },
      ],
    );
  },
  ReadTransportObjects: () => {
    // A request's entries under two tasks and both program IDs, and one SAP
    // lists untyped.
    const reading = {
      entries: [
        {
          pgmid: 'R3TR',
          type: 'CLAS',
          name: 'ZCL_A',
          position: '1',
          task: 'T1',
        },
        {
          pgmid: 'LIMU',
          type: 'METH',
          name: 'ZCL_A M',
          position: '2',
          task: 'T2',
        },
      ],
      incompleteEntries: [{ pgmid: 'R3TR', name: 'ZX', position: '3' }],
    };
    const heads = [
      { head: 'transport', value: 'K900001' },
      { head: 'count', value: '3' },
    ];
    return writtenTie(
      'ReadTransportObjects',
      [TRANSPORT_OBJECTS_LISTS],
      TRANSPORT_OBJECTS_HEADS,
      [
        {
          reading,
          lines: writtenLines({
            heads,
            reading,
            lists: TRANSPORT_OBJECTS_LISTS,
          }),
        },
      ],
      'the',
    );
  },
  ListTransports: () => {
    const entry = {
      number: 'K900001',
      description: 'A change',
      type: 'K',
      status: 'D',
      owner: 'DEV',
      target: 'QAS',
    };
    // A request, and the same one again through another branch.
    const reading = {
      requests: [
        { entry, repeat: false },
        { entry, repeat: true },
      ],
    };
    const heads = [{ head: 'count', value: '1' }];
    return writtenTie('ListTransports', [TRANSPORTS_LISTS], TRANSPORTS_HEADS, [
      {
        reading,
        lines: writtenLines({ heads, reading, lists: TRANSPORTS_LISTS }),
      },
    ]);
  },
  ReadTransportActionLog: () => {
    const reading = { entries: [{ text: 'Created' }, { text: '=====' }] };
    const heads = [
      { head: 'transport', value: 'K900001' },
      { head: 'count', value: '1' },
    ];
    return writtenTie(
      'ReadTransportActionLog',
      [ACTION_LOG_LISTS],
      ACTION_LOG_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: ACTION_LOG_LISTS }),
        },
      ],
      'the',
    );
  },
  GetInactiveObjects: () => {
    const reading: IInactiveObjectsResponse = {
      objects: [
        { type: 'CLAS/OC', name: 'ZCL_A' },
        {
          type: 'FUGR/FF',
          name: 'Z_FM',
          parentUri: '/sap/bc/adt/functions/groups/zfg',
        },
      ],
    };
    const heads = [{ head: 'count', value: '2' }];
    return writtenTie('GetInactiveObjects', [INACTIVE_LISTS], INACTIVE_HEADS, [
      {
        reading,
        lines: writtenLines({ heads, reading, lists: INACTIVE_LISTS }),
      },
    ]);
  },
  GetObjectVersions: () => {
    const reading = {
      versions: [
        {
          versionId: '00001',
          author: 'DEV',
          updatedAt: '2026-01-01',
          transportRequest: 'K900001',
          contentUri: '/sap/bc/adt/x',
        },
      ],
    };
    const heads = [{ head: 'object', value: 'CLAS/OC ZCL_A' }];
    return writtenTie('GetObjectVersions', [VERSIONS_LISTS], VERSIONS_HEADS, [
      {
        reading,
        lines: writtenLines({ heads, reading, lists: VERSIONS_LISTS }),
      },
    ]);
  },
  GetTransaction: () => {
    const reading = {
      properties: [{ facet: 'TYPE', name: 'R', text: 'Report' }],
    };
    const heads = [
      { head: 'transaction', value: 'SE38' },
      { head: 'text', value: 'ABAP Editor' },
      { head: 'package', value: 'SEDT' },
    ];
    return writtenTie(
      'GetTransaction',
      [TRANSACTION_LISTS],
      TRANSACTION_HEADS,
      [
        {
          reading,
          lines: writtenLines({ heads, reading, lists: TRANSACTION_LISTS }),
        },
      ],
      "the transaction's",
    );
  },
  GetPackageTree: () => {
    // A package, its subpackage, an object with its description and one
    // SAP lists nameless.
    const reading: PackageNode = {
      name: 'ZPKG',
      type: 'DEVC/K',
      isPackage: true,
      children: [
        {
          name: 'ZSUB',
          type: 'DEVC/K',
          isPackage: true,
          children: [
            {
              name: 'ZCL_A',
              type: 'CLAS/OC',
              isPackage: false,
              description: 'A class',
              children: [],
            },
            {
              name: '',
              type: 'PROG/P',
              isPackage: false,
              techName: 'ZT',
              uri: '/sap/x',
              children: [],
            },
          ],
        },
      ],
    };
    return writtenTie(
      'GetPackageTree',
      Object.values(PACKAGE_TREE_LISTS),
      [],
      Object.values(PACKAGE_TREE_LISTS).map((lists) => ({
        reading,
        lines: writtenLines({ heads: [], reading, lists }),
      })),
    );
  },
  GetPackageContents: () => {
    const parts = partsOfDescription(descriptionOf('GetPackageContents'));
    assert.ok(parts !== undefined);
    // An object of the package, one of a subpackage, one SAP lists nameless.
    const reading = {
      name: 'ZPKG',
      items: [
        { name: 'ZCL_A', type: 'CLAS/OC', packageName: 'ZPKG', techName: 'X' },
        { name: 'ZTAB', type: 'TABL/DT', packageName: 'ZSUB' },
        { name: '', type: 'PROG/P', packageName: 'ZSUB', uri: '/sap/x' },
      ],
    };
    return {
      terse: Object.values(CONTENTS_LISTS).flatMap(shapesOf),
      heads: [],
      returns: parts.returns,
      samples: Object.values(CONTENTS_LISTS).map((lists) => ({
        reading,
        lines: writtenLines({ heads: [], reading, lists }),
      })),
    };
  },
  GetAdtTypes: () => {
    const parts = partsOfDescription(descriptionOf('GetAdtTypes'));
    assert.ok(parts !== undefined);
    const reading = {
      items: [
        { name: 'CLAS', description: 'Class\nits members' },
        { name: 'TABL' },
      ],
    };
    return {
      terse: shapesOf(TYPES_LISTS),
      heads: TYPES_HEADS,
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({
            heads: [{ head: 'count', value: '2' }],
            reading,
            lists: TYPES_LISTS,
          }),
        },
      ],
    };
  },
  SearchObject: () => {
    const parts = partsOfDescription(descriptionOf('SearchObject'));
    assert.ok(parts !== undefined);
    const reading = {
      hits: [
        {
          name: 'ZCL_A',
          type: 'CLAS/OC' as const,
          description: 'A class',
          packageName: 'ZPKG',
        },
      ],
    };
    return {
      terse: shapesOf(SEARCH_HITS_LISTS),
      heads: [],
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({ heads: [], reading, lists: SEARCH_HITS_LISTS }),
        },
      ],
    };
  },
  DescribeByList: () => {
    const parts = partsOfDescription(descriptionOf('DescribeByList'));
    assert.ok(parts !== undefined);
    // An object its search described, and one whose search SAP refused.
    const reading = {
      lines: [
        {
          kind: 'row' as const,
          hit: {
            name: 'ZCL_A',
            type: 'CLAS/OC' as const,
            description: 'A class',
            packageName: 'ZPKG',
          },
        },
        {
          kind: 'error' as const,
          name: 'ZGONE',
          failure: { message: 'refused', step: 'search' },
        },
      ],
    };
    return {
      terse: shapesOf(DESCRIBED_LISTS),
      heads: [],
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({ heads: [], reading, lists: DESCRIBED_LISTS }),
        },
      ],
    };
  },
  GetWhereUsed: () => {
    const parts = partsOfDescription(descriptionOf('GetWhereUsed'));
    assert.ok(parts !== undefined);
    // A package node, a usage, and a usage SAP listed without a name.
    const reading = {
      totalReferences: 3,
      references: [
        { name: 'ZPKG', type: 'DEVC/K' },
        {
          name: 'ZCL_USER',
          type: 'CLAS/OC',
          package_name: 'ZPKG',
          usage_information: 'gradeDirect,includeProductive',
        },
        {
          name: '',
          type: 'PROG/P',
          uri: '/sap/bc/adt/x',
          package_name: 'ZPKG',
          usage_information: 'gradeIndirect',
        },
      ],
    };
    return {
      terse: shapesOf(WHERE_USED_LISTS),
      heads: WHERE_USED_HEADS,
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({
            heads: [{ head: 'total', value: '3' }],
            reading,
            lists: WHERE_USED_LISTS,
          }),
        },
      ],
    };
  },
  GetObjectsList: () => {
    const parts = partsOfDescription(descriptionOf('GetObjectsList'));
    assert.ok(parts !== undefined);
    const reading = {
      parent_name: 'ZPROG',
      parent_type: 'PROG/P',
      objects: [
        { OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINC', TECH_NAME: 'ZINC_T' },
        { OBJECT_TYPE: 'PROG/PL', OBJECT_NAME: '', OBJECT_URI: '/sap/x' },
      ],
    };
    return {
      terse: shapesOf(OBJECTS_LIST_LISTS),
      heads: OBJECTS_LIST_HEADS,
      of: OBJECTS_LIST_OF,
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({
            heads: [
              { head: 'parent', value: 'PROG/P ZPROG' },
              { head: 'total', value: '2' },
            ],
            reading,
            lists: OBJECTS_LIST_LISTS,
          }),
        },
      ],
    };
  },
  GetObjectsByType: () => {
    const parts = partsOfDescription(descriptionOf('GetObjectsByType'));
    assert.ok(parts !== undefined);
    // Every list a level holds: an object, one SAP lists in part, a node it
    // left unloaded, a node below.
    const reading = {
      objects: [
        {
          type: 'CLAS/OC' as const,
          objectName: 'ZCL_A',
          techName: 'ZCL_A',
          objectUri: '/sap/bc/adt/oo/classes/zcl_a',
          description: 'A class',
        },
      ],
      incompleteObjects: [{ type: 'CLAS/OC' as const, objectUri: '/sap/x' }],
      notLoaded: [{ notLoaded: true as const }],
      childNodes: [{ type: 'CLAS/OC' as const, nodeId: '000001' }],
    };
    const heads = [
      { head: 'parent', value: 'DEVC/K ZPKG' },
      { head: 'node_id', value: '000001' },
      { head: 'count', value: '2' },
    ];
    return {
      terse: Object.values(OBJECTS_BY_TYPE_LISTS).flatMap(shapesOf),
      heads: OBJECTS_BY_TYPE_HEADS,
      of: 'the',
      returns: parts.returns,
      samples: Object.values(OBJECTS_BY_TYPE_LISTS).map((lists) => ({
        reading,
        lines: writtenLines({ heads, reading, lists }),
      })),
    };
  },
  SearchSource: () => {
    const parts = partsOfDescription(descriptionOf('SearchSource'));
    assert.ok(parts !== undefined);
    const hit = {
      devclass: 'ZPKG',
      object_type: 'CLAS' as const,
      object_name: 'ZCL_A',
      include: 'ZCL_A',
    };
    const scan = {
      scanned: { objects: 2, sources: 3, objects_with_hits: 1 },
      truncated: { by_object_cap: true, by_max_hits: true },
      not_loaded: [{ package: 'ZPKG', type: 'PROG/P' }],
      incomplete: [{ package: 'ZPKG', type: 'CLAS/OC', uri: '/sap/bc/x' }],
    };
    const heads = [
      { head: 'scanned', value: 'objects 2 sources 3 objects_with_hits 1' },
      { head: 'truncated', value: 'by_object_cap' },
      { head: 'truncated', value: 'by_max_hits' },
    ];
    // A scan at each answer level: lines, snippets, objects.
    const samples = [
      { level: 'lines', results: [{ ...hit, line: 3 }] },
      { level: 'snippets', results: [{ ...hit, line: 3, snippet: 'x' }] },
      { level: 'objects', results: [{ ...hit, hits: 2 }] },
    ].map(({ level, results }) => {
      const lists =
        SEARCH_SOURCE_LISTS[level as keyof typeof SEARCH_SOURCE_LISTS];
      const reading = { ...scan, results };
      return { reading, lines: writtenLines({ heads, reading, lists }) };
    });
    return {
      terse: Object.values(SEARCH_SOURCE_LISTS).flatMap(shapesOf),
      heads: SEARCH_SOURCE_HEADS,
      returns: parts.returns,
      samples,
    };
  },
  GetMainPrograms: () => {
    const parts = partsOfDescription(descriptionOf('GetMainPrograms'));
    assert.ok(parts !== undefined);
    const reading = {
      programs: [
        {
          name: 'ZPROG',
          type: 'PROG/P',
          uri: '/sap/bc/adt/programs/programs/zprog',
        },
        {
          name: 'ZFG',
          type: 'FUGR/F',
          uri: '/sap/bc/adt/functions/groups/zfg',
        },
      ],
    };
    return {
      terse: shapesOf(MAIN_PROGRAMS_LISTS),
      heads: MAIN_PROGRAMS_HEADS,
      returns: parts.returns,
      samples: [
        {
          reading,
          lines: writtenLines({
            heads: [{ head: 'include', value: 'ZINC' }],
            reading,
            lists: MAIN_PROGRAMS_LISTS,
          }),
        },
      ],
    };
  },
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

  it('states no fact of a kind left out: its reason stays in the schema', () => {
    const left: RowSchemas<{ objects: readonly Item[] }> = {
      objects: about(
        'for each object',
        rows('objects', {
          columns,
          header: 'always',
          omit: omitting((o: Item) => (o.type === '' ? 'node' : 'object'), {
            node: 'the nodes are left out',
          }),
        }),
      ),
    };
    const facts = returnsOf({ shapes: [shapesOf(left)] }).map((f) => f.text);
    assert.deepStrictEqual(facts, ['For each object: its type and its name.']);
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
