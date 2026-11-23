/**
 * Byte-identical goldens for the move to completeness by construction (plan
 * step 9.2): each tool's answer at terse, medium and full, on fixed
 * documents, recorded by the code before the tool moved onto
 * `writeListing` (`npm test -- --env WRITE_TERSE_GOLDENS=1 <this file>`,
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
import { handleGetEnhancements } from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleListFunctionGroupIncludes } from '../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../../handlers/function_include/readonly/handleListFunctionModules';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetPackageContents } from '../../../handlers/package/readonly/handleGetPackageContents';
import { handleGetObjectsByType } from '../../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleGetStructuresList } from '../../../handlers/structure/readonly/handleGetStructuresList';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { searchSourceRows } from '../../../handlers/system/readonly/handleSearchSource';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import type { DetailLevel } from '../../../lib/detail';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import { runSearchSource } from '../../../lib/search-source/orchestrator';
import { skipSapAnswers } from '../../../lib/search-source/readFailure';
import { declareSystemKind } from '../../../lib/systemKind';
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

/** What a handler answered: its error flag and its text. */
interface Answered {
  isError: boolean;
  text: string;
}

function answeredOf(result: {
  isError?: boolean | undefined;
  content: Array<{ type: string; text?: string }>;
}): Answered {
  return {
    isError: result.isError === true,
    text: result.content.map((part) => part.text ?? '').join('\n'),
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

// GetObjectsByType takes no `detail`: its one answer, at each level the same.
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
  CASES[`GetObjectsByType ${label}`] = async () =>
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
  CASES[`SearchSource rows at ${answer}`] = async () => ({
    isError: false,
    text: searchSourceRows(await scanned(answer)),
  });
}

describe('terse goldens: answers stay byte-identical (WRITE_TERSE_GOLDENS=1 records them)', () => {
  const writing = process.env.WRITE_TERSE_GOLDENS === '1';
  const expected: Record<string, Answered> = fs.existsSync(FIXTURE_SOURCE)
    ? JSON.parse(fs.readFileSync(FIXTURE_SOURCE, 'utf8'))
    : {};
  const answered: Record<string, Answered> = { ...expected };

  for (const [name, run] of Object.entries(CASES)) {
    for (const detail of DETAILS) {
      const key = `${name} @${detail}`;
      it(key, async () => {
        const answer = await run(detail);
        answered[key] = answer;
        if (!writing) assert.deepStrictEqual(answer, expected[key]);
      });
    }
  }

  after(() => {
    if (!writing) return;
    if (process.env.CI) throw new Error('the goldens are not written under CI');
    fs.writeFileSync(FIXTURE_SOURCE, `${JSON.stringify(answered, null, 2)}\n`);
  });
});
