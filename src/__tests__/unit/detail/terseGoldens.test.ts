/**
 * Byte-identical goldens for the move to completeness by construction (plan
 * step 9.2): each tool's answer at terse, medium and full, on fixed
 * documents, recorded by the code before the tool moved onto
 * `writeListing` (`npm run goldens:terse`, `scripts/write-terse-goldens.mjs`,
 * refused under CI) and reviewed in its diff. Every later change must leave
 * each answer equal; a change of an answer is recorded in the step that
 * makes it, named in its commit.
 *
 * Each case runs the handler over a recording connection — real adt-clients
 * code, no SAP. The tools already pinned at every level by
 * `shippedReadings.test.ts` are pinned there.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { handleGetAbapGitBranchInfo } from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import { handleLinkAbapGitRepo } from '../../../handlers/abapgit/high/handleLinkAbapGitRepo';
import { handlePullAbapGitRepo } from '../../../handlers/abapgit/high/handlePullAbapGitRepo';
import { handleCheckAbapGitExternalRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import { handleCheckAbapGitRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitRepo';
import { handleGetAbapGitErrorLog } from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import { handleGetAbapGitModifiedObjects } from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import { handleGetAbapGitStaging } from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import { handleListAbapGitRepos } from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import { handleGetATCFindings } from '../../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCResult } from '../../../handlers/atc/high/handleGetATCResult';
import { handleGetEnhancements } from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleListFunctionGroupIncludes } from '../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../../handlers/function_include/readonly/handleListFunctionModules';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetMainPrograms } from '../../../handlers/include/readonly/handleGetMainPrograms';
import { handleGetPackage } from '../../../handlers/package/high/handleGetPackage';
import { handleGetPackageContents } from '../../../handlers/package/readonly/handleGetPackageContents';
import { handleGetObjectsByType } from '../../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleGetStructuresList } from '../../../handlers/structure/readonly/handleGetStructuresList';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { handleDescribeByList } from '../../../handlers/system/readonly/handleDescribeByList';
import { handleGetObjectOutline } from '../../../handlers/system/readonly/handleGetObjectOutline';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  type FeedShown,
  handleRuntimeListFeeds,
  terseFeedText,
} from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import { searchSourceRows } from '../../../handlers/system/readonly/handleSearchSource';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import { handleReadTransportActionLog } from '../../../handlers/transport/readonly/handleReadTransportActionLog';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import type { DetailLevel } from '../../../lib/detail';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import { runSearchSource } from '../../../lib/search-source/orchestrator';
import { skipSapAnswers } from '../../../lib/search-source/readFailure';
import { assembleTree } from '../../../lib/strategies/packageWalk';
import { declareSystemKind } from '../../../lib/systemKind';
import {
  ADMITTED_REPO,
  BOUND_CREDENTIALS,
  contextOn,
  externalRepo,
  modifiedObjects,
  noObjects,
  objectResults,
  REPO_KEY,
  REPO_PACKAGE,
  REPO_URL,
  reposDocument,
  staging,
  stubSap,
} from '../../helpers/abapGitSap';
import { corpusBody } from '../../helpers/adtCorpus';
import { recordingConnection } from '../../helpers/recordingConnection';
import { repositoryRoot } from '../../helpers/repoRoot';
import {
  exactPackages,
  listing,
  sourcesFrom,
} from '../../helpers/sourceReaderFake';

const FIXTURE_SOURCE = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
  'terse-goldens.json',
);

const DETAILS: readonly DetailLevel[] = ['terse', 'medium', 'full'];

/**
 * What a handler answered: its error flag and the text of each MCP content
 * part, part for part — a boundary between parts is part of the answer.
 */
interface Answered {
  isError: boolean;
  parts: string[];
}

function answeredOf(result: {
  isError?: boolean | undefined;
  content: Array<{ type: string; text?: string }>;
}): Answered {
  return {
    isError: result.isError === true,
    parts: result.content.map((part) => part.text ?? ''),
  };
}

const ctx = (
  answers: Array<{ data: string; status?: number }>,
  kind: 'onprem' | 'cloud' = 'onprem',
) => {
  const connection = recordingConnection(answers);
  declareSystemKind(connection, kind);
  return { connection, logger: undefined };
};

const xmlHead = '<?xml version="1.0" encoding="utf-8"?>';

/** A node structure level of the given entries. */
const level = (...entries: string[]) =>
  `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT>${entries
    .map(
      (inner) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE>${inner}</SEU_ADT_REPOSITORY_OBJ_NODE>`,
    )
    .join('')}</TREE_CONTENT></DATA></asx:values></asx:abap>`;

/** Every case: its name, and how to run it at one detail. */
const CASES: Record<string, (detail: DetailLevel) => Promise<Answered>> = {};

/**
 * Every case with one answer, whatever the level — a tool that takes no
 * `detail`, or a writer called directly: recorded once, under its name
 * alone, so no level's label names an answer that level does not give.
 */
const SINGLE: Record<string, () => Promise<Answered>> = {};

// GetObjectsByType takes no `detail`: its one answer.
for (const [label, descriptions, data] of [
  [
    'objects, a nameless one, two nodes not loaded, descriptions',
    true,
    level(
      '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>ZCL_A</OBJECT_NAME><TECH_NAME>ZCL_A</TECH_NAME><OBJECT_URI>/sap/bc/adt/oo/classes/zcl_a</OBJECT_URI><DESCRIPTION>First\ttab</DESCRIPTION>',
      '<OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><OBJECT_NAME>Z_FM</OBJECT_NAME><TECH_NAME>SAPLZFG</TECH_NAME>',
      '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME/><OBJECT_URI>/sap/bc/adt/oo/classes/nameless</OBJECT_URI>',
      '<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>',
      '<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>',
    ),
  ],
  [
    'objects without descriptions',
    false,
    level(
      '<OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>#ZCL_B</OBJECT_NAME><DESCRIPTION>kept out</DESCRIPTION>',
    ),
  ],
  ['an empty level', true, level()],
] as const) {
  SINGLE[`GetObjectsByType ${label}`] = async () =>
    answeredOf(
      await handleGetObjectsByType(ctx([{ data }]) as never, {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
        node_id: '000029',
        with_short_descriptions: descriptions,
      }),
    );
}

/** A destination with no communication batch: reads go one by one, in order. */
const sequential = (answers: Array<{ data: string; status?: number }>) => {
  const availability = createBatchAvailability();
  availability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  return { ...ctx(answers), batchAvailability: availability };
};

const node = (type: string, name: string, description = '') =>
  `<OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_NAME>${name}</OBJECT_NAME><TECH_NAME>${name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${name.toLowerCase()}</OBJECT_URI>${description === '' ? '' : `<DESCRIPTION>${description}</DESCRIPTION>`}`;

/** A package root with a class, a subpackage, a nameless object and a node not loaded. */
const ROOT_P = level(
  node('CLAS/OC', 'ZCL_A', 'Class A'),
  node('DEVC/K', 'ZSUB', 'Sub'),
  '<OBJECT_TYPE>PROG/P</OBJECT_TYPE><OBJECT_NAME/><OBJECT_URI>/sap/bc/adt/programs/programs/nameless</OBJECT_URI>',
  '<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>',
);
const ROOT_SUB = level(node('PROG/P', 'ZPROG', 'Program'));
const REFUSED = {
  status: 403,
  data: `${xmlHead}<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionNotAuthorized"/><message lang="EN">no authorization</message></exc:exception>`,
};

for (const descriptions of [false, true]) {
  CASES[
    `GetPackageContents one package, a subpackage${descriptions ? ', descriptions' : ''}`
  ] = async (detail) =>
    answeredOf(
      await handleGetPackageContents(
        sequential([{ data: ROOT_P }, { data: ROOT_SUB }]) as never,
        {
          package_name: 'ZPKG',
          include_descriptions: descriptions,
          detail,
        } as never,
      ),
    );
  CASES[
    `GetPackageContents two packages, one refused${descriptions ? ', descriptions' : ''}`
  ] = async (detail) =>
    answeredOf(
      await handleGetPackageContents(
        sequential([{ data: ROOT_SUB }, REFUSED]) as never,
        {
          package_names: ['ZSUB', 'ZGONE'],
          include_descriptions: descriptions,
          detail,
        } as never,
      ),
    );
}

const PACKAGE_METADATA = corpusBody(
  'read-metadata-package--01-packages-zmcpshrpkg',
);

for (const descriptions of [false, true]) {
  CASES[
    `GetPackageTree one package, a subpackage${descriptions ? ', descriptions' : ''}`
  ] = async (detail) =>
    answeredOf(
      await handleGetPackageTree(
        sequential([
          { data: PACKAGE_METADATA },
          { data: ROOT_P },
          { data: ROOT_SUB },
        ]) as never,
        {
          package_name: 'ZPKG',
          include_descriptions: descriptions,
          background: false,
          detail,
        } as never,
      ),
    );
  CASES[
    `GetPackageTree two packages, one refused${descriptions ? ', descriptions' : ''}`
  ] = async (detail) =>
    answeredOf(
      await handleGetPackageTree(
        sequential([
          { data: PACKAGE_METADATA },
          { data: ROOT_SUB },
          REFUSED,
        ]) as never,
        {
          package_names: ['ZSUB', 'ZGONE'],
          include_descriptions: descriptions,
          background: false,
          detail,
        } as never,
      ),
    );
}

/** A function group's level: a module, an include, a nameless one, a node not loaded. */
const GROUP_LEVEL = level(
  '<OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><OBJECT_NAME>Z_FM</OBJECT_NAME><TECH_NAME>Z_FM</TECH_NAME><OBJECT_URI>/sap/bc/adt/functions/groups/zfg/fmodules/z_fm</OBJECT_URI><DESCRIPTION>A module</DESCRIPTION>',
  '<OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME>ZFG_TOP</OBJECT_NAME><TECH_NAME>LZFGTOP</TECH_NAME><OBJECT_URI>/sap/bc/adt/functions/groups/zfg/includes/lzfgtop</OBJECT_URI>',
  '<OBJECT_TYPE>FUGR/I</OBJECT_TYPE><OBJECT_NAME/><OBJECT_URI>/sap/bc/adt/functions/groups/zfg/includes/nameless</OBJECT_URI>',
  '<OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME>',
);
const metadataOf = (description: string) =>
  `${xmlHead}<adtcore:x xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}"/>`;

CASES['GetObjectsList one parent'] = async (detail) =>
  answeredOf(
    await handleGetObjectsList(
      sequential([
        { data: GROUP_LEVEL },
        { data: metadataOf('Module') },
        { data: metadataOf('Top') },
        { data: metadataOf('Nameless') },
      ]) as never,
      {
        parent_name: 'ZFG',
        parent_tech_name: 'ZFG',
        parent_type: 'FUGR/F',
        detail,
      } as never,
    ),
  );
CASES['GetObjectsList two parents, one refused'] = async (detail) =>
  answeredOf(
    await handleGetObjectsList(
      sequential([
        { data: GROUP_LEVEL },
        REFUSED,
        { data: metadataOf('Module') },
        { data: metadataOf('Top') },
        { data: metadataOf('Nameless') },
      ]) as never,
      {
        objects: [
          { parent_name: 'ZFG', parent_type: 'FUGR/F' },
          { parent_name: 'ZGONE', parent_type: 'FUGR/F' },
        ],
        detail,
      } as never,
    ),
  );

/** A function group's root: its child nodes. */
const GROUP_ROOT = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT/><OBJECT_TYPES><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>FUGR/FF</OBJECT_TYPE><NODE_ID>000001</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>FUGR/I</OBJECT_TYPE><NODE_ID>000002</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO></OBJECT_TYPES></DATA></asx:values></asx:abap>`;

for (const [tool, handler] of [
  ['ListFunctionModules', handleListFunctionModules],
  ['ListFunctionGroupIncludes', handleListFunctionGroupIncludes],
] as const) {
  CASES[`${tool} a group's children`] = async (detail) =>
    answeredOf(
      await handler(
        sequential([
          {
            data: corpusBody(
              'read-metadata-function-group--01-groups-zmcpshrfgrp',
            ),
          },
          { data: GROUP_ROOT },
          { data: GROUP_LEVEL },
        ]) as never,
        { function_group_name: 'ZFG', detail } as never,
      ),
    );
}

CASES['GetIncludesList a program, one include read, one refused'] = async (
  detail,
) =>
  answeredOf(
    await handleGetIncludesList(
      sequential([
        { data: 'REPORT zprog.\nINCLUDE zinc_a.\nINCLUDE zinc_b.\n' },
        { data: 'INCLUDE zinc_c.\n' },
        REFUSED,
        { data: '* leaf\n' },
      ]) as never,
      { object_name: 'ZPROG', object_type: 'PROG/P', detail } as never,
    ),
  );
CASES['GetIncludesList two programs, one refused'] = async (detail) =>
  answeredOf(
    await handleGetIncludesList(
      sequential([
        { data: 'REPORT zprog.\nINCLUDE zinc_a.\n' },
        { data: '* leaf\n' },
        REFUSED,
      ]) as never,
      {
        objects: [
          { object_name: 'ZPROG', object_type: 'PROG/P' },
          { object_name: 'ZGONE', object_type: 'PROG/P' },
        ],
        detail,
      } as never,
    ),
  );

const STRUCTURE = (name: string, ...includes: string[]) =>
  `@EndUserText.label : '${name}'\ndefine structure ${name} {\n  a : abap.char(1);\n${includes
    .map((include) => `  include ${include};\n`)
    .join('')}}\n`;

CASES['GetStructuresList a structure, an include, one not read'] = async (
  detail,
) =>
  answeredOf(
    await handleGetStructuresList(
      sequential([
        { data: STRUCTURE('zs', 'zinc', 'zgone') },
        { data: STRUCTURE('zinc', 'zs') },
        REFUSED,
        REFUSED,
      ]) as never,
      { structure_name: 'ZS', include_extensions: false, detail } as never,
    ),
  );
CASES['GetStructuresList two structures, one refused'] = async (detail) =>
  answeredOf(
    await handleGetStructuresList(
      sequential([{ data: STRUCTURE('zs') }, REFUSED, REFUSED]) as never,
      {
        structure_names: ['ZS', 'ZGONE'],
        include_extensions: false,
        detail,
      } as never,
    ),
  );

const b64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64');
const implementation = (name: string, source: string) =>
  `<enh:enhancementImplementations adtcore:name="${name}" adtcore:type="ENHO/XHH" adtcore:version="active">` +
  `<enh:elements><enh:sourceCodePlugin enh:uri="/x" enh:id="1 " enh:full_name="PR:PEX:P_01EI" enh:mode="static">` +
  `<enh:source>${b64(source)}</enh:source>` +
  `</enh:sourceCodePlugin></enh:elements>` +
  `<enh:enhancedObject adtcore:uri="/p" adtcore:type="CLAS/OC" adtcore:name="ZCL_E"/>` +
  `</enh:enhancementImplementations>`;
const ENHANCEMENTS = `<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">${implementation(
  'Z_FIRST',
  'ENHANCEMENT 1 z_first.\nENDENHANCEMENT.',
)}${implementation('Z_SECOND', 'ENHANCEMENT 1 z_second.')}</enh:enhancements>`;
const NO_ENHANCEMENTS =
  '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>';

CASES['GetEnhancements a class with two enhancements'] = async (detail) =>
  answeredOf(
    await handleGetEnhancements(
      sequential([{ data: ENHANCEMENTS }]) as never,
      {
        object_name: 'ZCL_E',
        object_type: 'class',
        detail,
      } as never,
    ),
  );
CASES['GetEnhancements two classes, one refused'] = async (detail) =>
  answeredOf(
    await handleGetEnhancements(
      sequential([{ data: NO_ENHANCEMENTS }, REFUSED]) as never,
      {
        objects: [
          { object_name: 'ZCL_E', object_type: 'class' },
          { object_name: 'ZCL_GONE', object_type: 'class' },
        ],
        detail,
      } as never,
    ),
  );

/** A scan of one package: a program with hits, a node SAP could not load, a target listed without a name. */
async function scanned(answer: 'objects' | 'lines' | 'snippets') {
  return runSearchSource(
    {
      lineMatch: substringLineMatch,
      sapAnswers: skipSapAnswers,
      fetchPackageContents: async (name) =>
        listing(name, [
          {
            name: 'not loaded by SAP',
            type: 'CLAS/OC',
            packageName: 'ZPKG',
            isPackage: false,
            notLoaded: true,
          },
          {
            name: '',
            type: 'PROG/P',
            packageName: 'ZPKG',
            isPackage: false,
            uri: '/sap/bc/adt/programs/programs/znameless',
          },
          {
            name: 'ZPROG',
            type: 'PROG/P',
            packageName: 'ZPKG',
            isPackage: false,
          },
          {
            name: 'ZPROG2',
            type: 'PROG/P',
            packageName: 'ZPKG',
            isPackage: false,
          },
        ]),
      sourceReader: sourcesFrom({
        'PROG:ZPROG': 'one hit\nnone\nhit\ttwo',
        'PROG:ZPROG2': 'hit',
      }),
      resolvePackages: exactPackages,
    },
    { query: 'hit', packages: ['ZPKG'], answer },
  );
}

// SearchSource's terse rows (`searchSourceRows`), at each answer level.
for (const answer of ['objects', 'lines', 'snippets'] as const) {
  SINGLE[`SearchSource rows at ${answer}`] = async () => ({
    isError: false,
    parts: [searchSourceRows(await scanned(answer)).answer],
  });
}

/** A quickSearch answer of two hits, one with an empty description. */
const SEARCH_HITS = `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_a" adtcore:type="CLAS/OC" adtcore:name="ZCL_A" adtcore:packageName="ZPKG" adtcore:description="one &amp; only"/><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_a2" adtcore:type="CLAS/OC" adtcore:name="ZCL_A2" adtcore:description=""/></adtcore:objectReferences>`;
const NO_HITS = `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>`;

CASES['DescribeByList a described object, one not found, one refused'] = async (
  detail,
) =>
  answeredOf(
    await handleDescribeByList(
      sequential([
        { data: SEARCH_HITS },
        { data: NO_HITS },
        { data: NO_HITS },
        REFUSED,
        REFUSED,
      ]) as never,
      {
        objects: [
          { name: 'ZCL_A', type: 'CLAS/OC' },
          { name: 'ZNONE', type: 'CLAS/OC' },
          { name: 'ZREF', type: 'CLAS/OC' },
        ],
        detail,
      } as never,
    ),
  );

const reference = (
  uri: string,
  type: string,
  name: string,
  pkg: string,
  usage?: string,
) =>
  `<usagereferences:referencedObject uri="${uri}" isResult="false" canHaveChildren="true"${usage === undefined ? '' : ` usageInformation="${usage}"`}><usagereferences:adtObject adtcore:responsible="SAPUSER01" adtcore:name="${name}" adtcore:type="${type}" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${pkg.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${pkg}"/></usagereferences:adtObject></usagereferences:referencedObject>`;
/** Usages in two packages, a package node, a nameless usage, an empty usage attribute. */
const WHERE_USED = `${xmlHead}<usagereferences:usageReferenceResult numberOfResults="4" resultDescription="Where-Used List: ZCL_X (Class)" xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:referencedObjects>${[
  reference('/sap/bc/adt/packages/zpkg', 'DEVC/K', 'ZPKG', 'ZPKG'),
  reference(
    '/sap/bc/adt/oo/classes/zcl_user',
    'CLAS/OC',
    'ZCL_USER',
    'ZPKG',
    'gradeDirect,includeProductive',
  ),
  reference(
    '/sap/bc/adt/programs/programs/zprog',
    'PROG/P',
    'ZPROG',
    'ZPKG',
    'gradeDirect,includeTest',
  ),
  reference(
    '/sap/bc/adt/oo/interfaces/zif_x',
    'INTF/OI',
    'ZIF_X',
    'ZOTHER',
    '',
  ),
  reference(
    '/sap/bc/adt/oo/classes/nameless',
    'CLAS/OC',
    '',
    'ZOTHER',
    'gradeDirect',
  ),
].join(
  '',
)}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

CASES['GetWhereUsed one object'] = async (detail) =>
  answeredOf(
    await handleGetWhereUsed(
      sequential([{ data: WHERE_USED }]) as never,
      {
        object_name: 'ZCL_X',
        object_type: 'CLAS/OC',
        detail,
      } as never,
    ),
  );
CASES['GetWhereUsed two objects, one refused'] = async (detail) =>
  answeredOf(
    await handleGetWhereUsed(
      sequential([{ data: WHERE_USED }, REFUSED]) as never,
      {
        objects: [
          { object_name: 'ZCL_X', object_type: 'CLAS/OC' },
          { object_name: 'ZCL_GONE', object_type: 'CLAS/OC' },
        ],
        detail,
      } as never,
    ),
  );

CASES['GetMainPrograms two programs and a group'] = async (detail) =>
  answeredOf(
    await handleGetMainPrograms(
      ctx([
        {
          data: `${xmlHead}<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zprog" adtcore:type="PROG/P" adtcore:name="ZPROG"/><adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zprog2" adtcore:type="PROG/P" adtcore:name="#ZPROG2"/><adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zfg" adtcore:type="FUGR/F" adtcore:name="ZFG"/></adtcore:objectReferences>`,
        },
      ]) as never,
      { include_name: 'zinc', detail } as never,
    ),
  );

// RuntimeListFeeds' terse text of each feed (`terseFeedText`), from what a read answered.
const FEEDS: readonly FeedShown[] = [
  {
    feed: 'descriptors',
    answered: {
      count: 2,
      entries: [
        { id: 'dumps', title: 'Short Dumps', url: '/d', category: 'runtime' },
        { id: 'messages', title: 'System\tMessages', url: '/m' },
      ],
    },
  },
  {
    feed: 'variants',
    answered: {
      count: 2,
      entries: [
        {
          feed: 'dumps',
          title: 'Short Dumps',
          variants: [
            { title: 'Mine', query: 'q1', is_default: true },
            { title: 'All', query: 'q2', is_default: false },
          ],
        },
        { feed: 'messages', title: 'System Messages', variants: [] },
      ],
    },
  },
  {
    feed: 'dumps',
    answered: {
      success: true,
      feed_type: 'dumps',
      count: 2,
      entries: [
        {
          dump_id: 'ID1',
          updated: '2026-11-22T10:00:00Z',
          title: 'DBSQL_SQL_ERROR',
        },
        { dump_id: 'ID2', updated: '2026-11-22T11:00:00Z', title: '#RAISE' },
      ],
      next_to: '20261122100000',
      incomplete_second: '20261122110000',
    },
  },
  {
    feed: 'system_messages',
    answered: {
      success: true,
      feed_type: 'system_messages',
      count: 2,
      entries: [
        {
          id: 'M1',
          createdOn: '2026-11-22',
          author: 'SAPUSER01',
          title: 'Downtime',
        },
        { messageId: 'M2', createdBy: 'SAPUSER02' },
      ],
    },
  },
  {
    feed: 'gateway_errors',
    answered: {
      success: true,
      feed_type: 'gateway_errors',
      count: 1,
      entries: [
        {
          opid: 'OP1',
          kind: 'Frontend',
          dateTime: '2026-11-22T10:00:00Z',
          type: 'E',
          shortText: 'failed',
          username: 'SAPUSER01',
        },
      ],
    },
  },
];
for (const shown of FEEDS) {
  SINGLE[`RuntimeListFeeds terse ${shown.feed}`] = async () => ({
    isError: false,
    parts: [terseFeedText(shown).answer],
  });
}

// RuntimeListFeeds through its handler, at every level (Codex round 11):
// the feed list SAP answers, two feeds, one holding a tab in its title.
const FEED_LIST = `${xmlHead}<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry><atom:id>/sap/bc/adt/runtime/dumps</atom:id><atom:title>ABAP Runtime Errors</atom:title><atom:link href="/sap/bc/adt/runtime/dumps"/></atom:entry><atom:entry><atom:id>/sap/bc/adt/runtime/traces</atom:id><atom:title>Traces&#9;tabbed</atom:title><atom:link href="/sap/bc/adt/runtime/traces"/></atom:entry></atom:feed>`;
CASES['RuntimeListFeeds descriptors through the handler'] = async (detail) =>
  answeredOf(
    await handleRuntimeListFeeds(
      ctx([{ data: FEED_LIST }]) as never,
      {
        feed_type: 'descriptors',
        detail,
      } as never,
    ),
  );

const logEntry = (text: string) =>
  `<log:entry><log:message><log:messageText key="TK(188)">${text}</log:messageText></log:message></log:entry>`;
CASES['ReadTransportActionLog lines and separators'] = async (detail) =>
  answeredOf(
    await handleReadTransportActionLog(
      ctx([
        {
          data: `${xmlHead}<log:log xmlns:log="http://www.sap.com/cts/adt/log">${[
            '========',
            'Export started',
            '--------',
            'Object ZCL_A\texported',
            '#Done',
          ]
            .map(logEntry)
            .join('')}</log:log>`,
        },
      ]) as never,
      { transport_number: 'SIDK900012', detail } as never,
    ),
  );

const request = (attributes: string, tasks = '') =>
  `<tm:request ${attributes}>${tasks}</tm:request>`;
const LISTING = `${xmlHead}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction=""><tm:workbench tm:parent_name=""><tm:modifiable tm:parent_name="">${[
  request(
    'tm:number="SIDK900001" tm:desc="One" tm:type="K" tm:status="D" tm:owner="SAPUSER01" tm:target="/QAS/"',
  ),
  request(
    'tm:desc="Without a number" tm:type="K" tm:status="D" tm:owner="SAPUSER01"',
  ),
  request(
    'tm:number="SIDK900002" tm:desc="Two" tm:type="K" tm:status="D" tm:owner="SAPUSER01"',
    '<tm:task tm:number="SIDK900003" tm:owner="SAPUSER01"/>',
  ),
].join(
  '',
)}</tm:modifiable></tm:workbench><tm:workbench tm:parent_name=""><tm:modifiable tm:parent_name="">${[
  request(
    'tm:number="SIDK900001" tm:desc="One" tm:type="K" tm:status="D" tm:owner="SAPUSER01" tm:target="/QAS/"',
  ),
  request(
    'tm:number="SIDK900002" tm:desc="Two, another text" tm:type="K" tm:status="D" tm:owner="SAPUSER02"',
    '<tm:task tm:number="SIDK900004" tm:owner="SAPUSER02"/>',
  ),
].join('')}</tm:modifiable></tm:workbench></tm:root>`;

CASES[
  'ListTransports a repeat, a number repeated with other content, a request without a number'
] = async (detail) =>
  answeredOf(
    await handleListTransports(
      ctx([{ data: LISTING }]) as never,
      {
        user: 'SAPUSER01',
        detail,
      } as never,
    ),
  );

CASES['GetATCFindings a recorded worklist'] = async (detail) =>
  answeredOf(
    await handleGetATCFindings(
      ctx([
        {
          data: corpusBody(
            'atc-findings-worklist--01-worklists-2aaa2806861e1fd1ad9bd28dca5c37ed',
          ),
        },
      ]) as never,
      { worklist_id: '2AAA2806861E1FD1AD9BD28DCA5C37ED', detail } as never,
    ),
  );
CASES['GetATCResult a recorded result'] = async (detail) =>
  answeredOf(
    await handleGetATCResult(
      ctx([
        {
          data: corpusBody(
            'atc-result-by-display-id--01-results-e6ac99b2161f1fe1b5a1e9b68e5cd628',
          ),
        },
      ]) as never,
      { display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628', detail } as never,
    ),
  );

for (const [label, corpus, type, name] of [
  [
    'a class',
    'read-outline-class--01-objectstructure',
    'CLAS/OC',
    'ZCL_MCP_SHR',
  ],
  [
    'a program',
    'read-outline-program--01-objectstructure',
    'PROG/P',
    'ZMCP_SHR_PROG',
  ],
  [
    'a function group',
    'read-outline-function-group--01-objectstructure',
    'FUGR/F',
    'ZMCP_SHR_FGRP',
  ],
] as const) {
  CASES[`GetObjectOutline ${label}`] = async (detail) =>
    answeredOf(
      await handleGetObjectOutline(
        ctx([{ data: corpusBody(corpus) }]) as never,
        {
          object_type: type,
          object_name: name,
          detail,
        } as never,
      ),
    );
}

const structureNode = (attributes: string) =>
  `<projectexplorer:node ${attributes}/>`;
const OBJECT_STRUCTURE = `${xmlHead}<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">${[
  structureNode(
    'nodeid="000002" parentid="000001" objecttype="CLAS/OA" isfolder="true" description="Attributes"',
  ),
  structureNode(
    'nodeid="000003" parentid="000002" objecttype="CLAS/OA" objectname="ZCL_X" description="ATTR" isfolder="false"',
  ),
  structureNode(
    'nodeid="000004" parentid="000001" objecttype="CLAS/OM" isfolder="true" description="Methods"',
  ),
  structureNode(
    'nodeid="000005" parentid="000004" objecttype="CLAS/OM" objectname="ZCL_X========CM001" description="RUN" isfolder="false"',
  ),
  structureNode(
    'nodeid="000006" objecttype="CLAS/OC" objectname="ZCL_OTHER" isfolder="false"',
  ),
].join('')}</projectexplorer:objectstructure>`;

for (const [label, data] of [
  ['a class', OBJECT_STRUCTURE],
  [
    'an empty structure',
    `${xmlHead}<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer"/>`,
  ],
] as const) {
  CASES[`GetObjectStructure ${label}`] = async (detail) =>
    answeredOf(
      await handleGetObjectStructure(
        ctx([{ data }]) as never,
        {
          objecttype: 'CLAS/OC',
          objectname: 'ZCL_X',
          detail,
        } as never,
      ),
    );
}

// Plan 9.7: the tree is what the writer writes, so it holds every node of
// the document — a node in a cycle of parents, or one sharing another's id,
// included.
CASES['GetObjectStructure a cycle of parents and a repeated id'] = async (
  detail,
) =>
  answeredOf(
    await handleGetObjectStructure(
      ctx([
        {
          data: `${xmlHead}<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">${[
            structureNode(
              'nodeid="000010" parentid="000011" objecttype="CLAS/OA" objectname="ZCL_X" description="A" isfolder="false"',
            ),
            structureNode(
              'nodeid="000011" parentid="000010" objecttype="CLAS/OA" objectname="ZCL_X" description="B" isfolder="false"',
            ),
            structureNode(
              'nodeid="000012" objecttype="CLAS/OA" objectname="ZCL_X" description="C" isfolder="false"',
            ),
            structureNode(
              'nodeid="000012" objecttype="CLAS/OA" objectname="ZCL_X" description="D" isfolder="false"',
            ),
          ].join('')}</projectexplorer:objectstructure>`,
        },
      ]) as never,
      { objecttype: 'CLAS/OC', objectname: 'ZCL_X', detail } as never,
    ),
  );

CASES['GetPackage a recorded package'] = async (detail) =>
  answeredOf(
    await handleGetPackage(
      ctx([{ data: PACKAGE_METADATA }]) as never,
      {
        package_name: 'ZMCP_SHR_PKG',
        detail,
      } as never,
    ),
  );

// GetEnhancements with include_nested: a program, its includes node, two
// includes — one read, one whose enhancements SAP refused (its probes the
// only thing it holds).
const PROGRAM_ROOT = `${xmlHead}<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TREE_CONTENT/><OBJECT_TYPES><SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>PROG/I</OBJECT_TYPE><NODE_ID>000010</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO></OBJECT_TYPES></DATA></asx:values></asx:abap>`;
CASES[
  'GetEnhancements include_nested, the object holding only refused probes'
] = async (detail) =>
  answeredOf(
    await handleGetEnhancements(
      sequential([
        REFUSED,
        {
          data: `${xmlHead}<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPROG" adtcore:type="PROG/P"/>`,
        },
        { data: NO_ENHANCEMENTS },
        { data: PROGRAM_ROOT },
        { data: level(node('PROG/I', 'ZINC_OK')) },
        {
          data: `${xmlHead}<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZINC_OK"><include:contextRef adtcore:uri="/sap/bc/adt/programs/programs/zprog" adtcore:type="PROG/P" adtcore:name="ZPROG"/></include:abapInclude>`,
        },
        { data: ENHANCEMENTS },
      ]) as never,
      {
        object_name: 'ZPROG',
        object_type: 'unknown-kind',
        include_nested: true,
        detail,
      } as never,
    ),
  );

// The package tree the writers write (`assembleTree`): an object of a
// package the tree never reaches goes under the root — every walked object
// in it (plan 9.3).
SINGLE['assembleTree an object of a package the tree does not reach'] =
  async () => ({
    isError: false,
    parts: [
      JSON.stringify(
        assembleTree('P', [
          { name: 'SUB', type: 'DEVC/K', packageName: 'P' },
          { name: 'ZA', type: 'CLAS/OC', packageName: 'SUB' },
          { name: 'ZORPHAN', type: 'PROG/P', packageName: 'ELSEWHERE' },
        ]),
      ),
    ],
  });

// Codex round 11: GetStructuresList writes every failure of a node not
// read, each its own line — the structure read's and the table read's.
// The abapGit tools (merged from #374): each read at every level its
// schema offers, each write's answer, over the abapGit unit fixtures.
const abapGitRun = async (
  handler: (context: ReturnType<typeof contextOn>) => Promise<{
    content: ReadonlyArray<{ text?: string }>;
    isError?: boolean;
  }>,
  admission: Parameters<typeof contextOn>[1],
  data: string,
): Promise<Answered> => {
  const sap = stubSap(() => ({ status: 200, data }));
  const result = await handler(contextOn(sap.connection, admission));
  return {
    isError: result.isError === true,
    parts: result.content.map((part) => part.text ?? ''),
  };
};
const ABAPGIT_R1 = { repo: ADMITTED_REPO, credentials: BOUND_CREDENTIALS };
const ABAPGIT_BOUND = { sendUrl: REPO_URL, credentials: BOUND_CREDENTIALS };
type AbapGitLevel = 'terse' | 'medium' | 'full';
const abapGitLevel = (detail: DetailLevel): AbapGitLevel =>
  detail === 'raw' ? 'full' : detail;

CASES['ListAbapGitRepos two repositories'] = (detail) =>
  abapGitRun(
    (context) =>
      handleListAbapGitRepos(context, { detail: abapGitLevel(detail) }),
    {},
    reposDocument,
  );
CASES['CheckAbapGitExternalRepo its branches'] = (detail) =>
  abapGitRun(
    (context) =>
      handleCheckAbapGitExternalRepo(context, {
        url: REPO_URL,
        detail: abapGitLevel(detail),
      }),
    ABAPGIT_BOUND,
    externalRepo(),
  );
CASES['GetAbapGitBranchInfo a branch with its folder logic'] = (detail) =>
  abapGitRun(
    (context) =>
      handleGetAbapGitBranchInfo(context, {
        url: REPO_URL,
        branch: 'refs/heads/main',
        package_name: REPO_PACKAGE,
        detail: abapGitLevel(detail),
      }),
    { sendUrl: REPO_URL, credentials: null },
    externalRepo({ folderLogic: true }),
  );
CASES['GetAbapGitModifiedObjects what a pull would overwrite'] = (detail) =>
  abapGitRun(
    (context) =>
      handleGetAbapGitModifiedObjects(context, {
        repository_key: REPO_KEY,
        detail: abapGitLevel(detail),
      }),
    ABAPGIT_R1,
    modifiedObjects,
  );
CASES['GetAbapGitStaging the staging'] = (detail) =>
  abapGitRun(
    (context) =>
      handleGetAbapGitStaging(context, {
        repository_key: REPO_KEY,
        detail: abapGitLevel(detail),
      }),
    ABAPGIT_R1,
    staging,
  );
// The staging with every list filled: a staged object with two files and an
// ignored one with none (Codex, group 1 review).
const STAGING_EVERY_LIST = staging
  .replace(
    '<abapgitstaging:staged_objects/>',
    '<abapgitstaging:staged_objects><abapgitstaging:abapgitobject abapgitstaging:wbkey="PROGZSTAGED" abapgitstaging:version="active" adtcore:uri="/sap/bc/adt/programs/programs/zstaged" adtcore:type="PROG/P" adtcore:name="ZSTAGED" adtcore:packageName="ZPKG"><abapgitstaging:abapgitfile abapgitstaging:name="zstaged.prog.abap" abapgitstaging:path="/src/" abapgitstaging:localState="M" abapgitstaging:remoteState=""/><abapgitstaging:abapgitfile abapgitstaging:name="zstaged.prog.xml" abapgitstaging:path="/src/" abapgitstaging:localState="A" abapgitstaging:remoteState="D"/></abapgitstaging:abapgitobject></abapgitstaging:staged_objects>',
  )
  .replace(
    '<abapgitstaging:ignored_objects/>',
    '<abapgitstaging:ignored_objects><abapgitstaging:abapgitobject abapgitstaging:wbkey="DEVCZIGNORED" abapgitstaging:version="active" adtcore:uri="/sap/bc/adt/packages/zignored" adtcore:type="DEVC/K" adtcore:name="ZIGNORED" adtcore:packageName="ZPKG"/></abapgitstaging:ignored_objects>',
  );
CASES['GetAbapGitStaging every list filled'] = (detail) =>
  abapGitRun(
    (context) =>
      handleGetAbapGitStaging(context, {
        repository_key: REPO_KEY,
        detail: abapGitLevel(detail),
      }),
    ABAPGIT_R1,
    STAGING_EVERY_LIST,
  );
CASES["GetAbapGitErrorLog a run's log"] = (detail) =>
  abapGitRun(
    (context) =>
      handleGetAbapGitErrorLog(context, {
        repository_key: REPO_KEY,
        app_log_key: '0123456789ABCDEF0123456789ABCDEF',
        detail: abapGitLevel(detail),
      }),
    ABAPGIT_R1,
    objectResults,
  );
SINGLE['CheckAbapGitRepo the check'] = () =>
  abapGitRun(
    (context) => handleCheckAbapGitRepo(context, { repository_key: REPO_KEY }),
    ABAPGIT_R1,
    '',
  );
SINGLE['LinkAbapGitRepo a link with its objects'] = () =>
  abapGitRun(
    (context) =>
      handleLinkAbapGitRepo(context, {
        package_name: REPO_PACKAGE,
        url: REPO_URL,
        branch: 'refs/heads/main',
      }),
    { sendUrl: REPO_URL, credentials: null },
    objectResults,
  );
SINGLE['PullAbapGitRepo a pull without objects'] = () =>
  abapGitRun(
    (context) => handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
    ABAPGIT_R1,
    noObjects,
  );

describe('GetStructuresList terse: every failure of a node not read', () => {
  it('ZGONE: the structure read and the table read, each a # failure line', async () => {
    const run =
      CASES['GetStructuresList a structure, an include, one not read'];
    assert.ok(run !== undefined);
    const [text = ''] = (await run('terse')).parts;
    const failures = text
      .split('\n')
      .filter((line) => line.startsWith('# failure\t'));
    assert.equal(failures.length, 2, text);
    assert.ok(failures[0]?.includes('"step":"read structure"'), text);
    assert.ok(failures[1]?.includes('"step":"read table"'), text);
  });
});

describe('terse goldens: answers stay byte-identical (WRITE_TERSE_GOLDENS=1 records them)', () => {
  const writing = process.env.WRITE_TERSE_GOLDENS === '1';
  const expected: Record<string, Answered> = fs.existsSync(FIXTURE_SOURCE)
    ? JSON.parse(fs.readFileSync(FIXTURE_SOURCE, 'utf8'))
    : {};
  // Only the keys of this run: a case removed or renamed leaves no stale
  // golden behind.
  const answered: Record<string, Answered> = {};

  const check = (key: string, run: () => Promise<Answered>) =>
    it(key, async () => {
      const answer = await run();
      answered[key] = answer;
      if (!writing) assert.deepStrictEqual(answer, expected[key]);
    });
  for (const [name, run] of Object.entries(CASES)) {
    for (const detail of DETAILS)
      check(`${name} @${detail}`, () => run(detail));
  }
  for (const [name, run] of Object.entries(SINGLE)) check(name, run);

  after(() => {
    if (!writing) return;
    if (process.env.CI) throw new Error('the goldens are not written under CI');
    const every =
      Object.keys(CASES).length * DETAILS.length + Object.keys(SINGLE).length;
    if (Object.keys(answered).length !== every) {
      throw new Error('the goldens are written only by a run of every case');
    }
    fs.writeFileSync(FIXTURE_SOURCE, `${JSON.stringify(answered, null, 2)}\n`);
  });
});
