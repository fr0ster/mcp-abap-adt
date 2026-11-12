/**
 * `GetObjectDraft` and `HandlerGet` `part: 'draft'`, live (plan Task 14):
 * for every type the draft tool reads on the configured variant (`DRAFT_TYPES`;
 * one case per type, each call written out, as the coverage ledger reads
 * them), an object of the run's own, created and activated, then:
 *
 * - `none`: after the activation every part reads `none`, `has_draft` false;
 * - `own`: after the writer's unactivated write the part written reads
 *   `own`, with `changed_at` (`null` for a metadata extension and a service
 *   definition) and its age within the call's own clock bounds;
 * - `other`: on premise, the second user (`draft.second_user_env`, its own
 *   connection) reads that part `other`; elsewhere skipped with the reason.
 *
 * Both tools are called at each state and answer the same: `draft`,
 * `changed_at` and the ETags per part, compared exactly (the age only
 * against each call's bounds). Every object is the run's own, in `$TMP` on
 * premise and in the configured package on the cloud, and deleted after.
 * The CDS view case is the live proof of its timestamp rule.
 *
 * Run: MCP_TEST_CONFIG=<config> npm run test:integration -- src/__tests__/integration/high/draft/ObjectDraft.test.ts
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type {
  DraftObjectType,
  DraftPart,
} from '../../../../lib/draft/draftTypes';
import { servedEntries } from '../../../helpers/servedEntries';
import { toolAnswer } from '../../../helpers/toolAnswer';
import {
  configuredSystemKind,
  loadTestConfig,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import {
  deleteRecorded,
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
  type ToolArgs,
} from '../../helpers/live';
import { skipRunningTest } from '../../helpers/runningTest';
import { configText, connectionAs } from '../../helpers/secondUser';

const S = randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
const onprem = (): boolean => configuredSystemKind() === 'onprem';
const packageName = (): string => (onprem() ? '$TMP' : resolvePackageName());
/** The configured request on the cloud; none on premise (`$TMP`). */
function onRequest(): ToolArgs {
  if (onprem()) return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}

/** The answer, or the case fails naming the step and what SAP answered. */
async function prepare(tool: string, args: ToolArgs): Promise<void> {
  const answer = await livePrepare(tool, { ...onRequest(), ...args });
  if (answer.isError) throw new Error(`${tool}: ${answer.text.slice(0, 800)}`);
}

/** The shared root view the RAP types are built on, the run's own. */
const ROOT = `ZMDR${S}_R`;

/** What a type's case makes, writes and reads. */
interface Recipe {
  /** The name the draft tools are given. */
  readonly name: string;
  readonly functionGroup?: string;
  /** Creates the object (and what it needs) and activates it; records each delete first. */
  create(): Promise<void>;
  /** The writer's unactivated write. */
  write(): Promise<void>;
  /** The part that write leaves a draft in. */
  readonly written: DraftPart;
}

const tableSource = (name: string, extra: string) =>
  [
    `@EndUserText.label : 'Draft live table'`,
    '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
    '@AbapCatalog.tableCategory : #TRANSPARENT',
    '@AbapCatalog.deliveryClass : #A',
    '@AbapCatalog.dataMaintenance : #RESTRICTED',
    `define table ${name.toLowerCase()} {`,
    '  key mandt : abap.clnt not null;',
    '  key id    : abap.char(10) not null;',
    '  val       : abap.char(20);',
    extra,
    '}',
  ].join('\n');

const structureSource = (name: string, extra: string) =>
  [
    `@EndUserText.label : 'Draft live structure'`,
    '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
    `define structure ${name.toLowerCase()} {`,
    '  f1 : abap.int1;',
    extra,
    '}',
  ].join('\n');

const viewSource = (name: string, extra: string, root: boolean) =>
  [
    '@AccessControl.authorizationCheck: #NOT_REQUIRED',
    `@EndUserText.label: 'Draft live view'`,
    '@Metadata.allowExtensions: true',
    `define ${root ? 'root ' : ''}view entity ${name} as select from zmcp_shr_btabl`,
    '{',
    '  key fld1 as Fld1,',
    `  fld2 as Fld2${extra}`,
    '}',
  ].join('\n');

const bdefSource = (extra: string) =>
  [
    `managed implementation in class zbp_mdr${S.toLowerCase()}_r unique;`,
    'strict ( 2 );',
    '',
    `define behavior for ${ROOT}`,
    'persistent table zmcp_shr_btabl',
    'lock master',
    'authorization master ( none )',
    '{',
    '  create;',
    '  update;',
    '  delete;',
    '  field ( readonly ) Fld1;',
    extra,
    '}',
  ].join('\n');

const localClass = (extra: string) =>
  [
    'CLASS lcl_probe DEFINITION.',
    extra,
    'ENDCLASS.',
    '',
    'CLASS lcl_probe IMPLEMENTATION.',
    'ENDCLASS.',
  ].join('\n');

const classSource = (name: string) =>
  [
    `CLASS ${name.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    METHODS a.',
    'ENDCLASS.',
    `CLASS ${name.toLowerCase()} IMPLEMENTATION.`,
    '  METHOD a.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');

/** A function group of the run's own, created activated. */
async function functionGroup(name: string): Promise<void> {
  recordCreated('DeleteFunctionGroup', { function_group_name: name });
  await prepare('CreateFunctionGroup', {
    function_group_name: name,
    package_name: packageName(),
    description: 'Draft live',
    activate: true,
  });
}

/** Each type's recipe; a new draft type without one fails its case. */
const RECIPES: Partial<Record<DraftObjectType, Recipe>> = {
  PROGRAM: {
    name: `ZMDR${S}_PROG`,
    written: 'main',
    async create() {
      const n = this.name;
      recordCreated('DeleteProgram', { program_name: n });
      await prepare('CreateProgram', {
        program_name: n,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateProgram', {
        program_name: n,
        source_code: `REPORT ${n.toLowerCase()}.\nWRITE / 'a'.`,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateProgram', {
        program_name: this.name,
        source_code: `REPORT ${this.name.toLowerCase()}.\nWRITE / 'b'.`,
        activate: false,
      });
    },
  },
  INCLUDE: {
    name: `ZMDR${S}_INCL`,
    written: 'main',
    async create() {
      recordCreated('DeleteInclude', { include_name: this.name });
      await prepare('CreateInclude', {
        include_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateInclude', {
        include_name: this.name,
        source_code: 'DATA gv_a TYPE i.',
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateInclude', {
        include_name: this.name,
        source_code: 'DATA gv_b TYPE i.',
        activate: false,
      });
    },
  },
  INTERFACE: {
    name: `ZIF_MDR${S}`,
    written: 'main',
    async create() {
      recordCreated('DeleteInterface', { interface_name: this.name });
      await prepare('CreateInterface', {
        interface_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateInterface', {
        interface_name: this.name,
        source_code: `INTERFACE ${this.name.toLowerCase()} PUBLIC.\n  METHODS a.\nENDINTERFACE.`,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateInterface', {
        interface_name: this.name,
        source_code: `INTERFACE ${this.name.toLowerCase()} PUBLIC.\n  METHODS a.\n  METHODS b.\nENDINTERFACE.`,
        activate: false,
      });
    },
  },
  CLASS: {
    name: `ZCL_MDR${S}`,
    written: 'implementations',
    async create() {
      recordCreated('DeleteClass', { class_name: this.name });
      await prepare('CreateClass', {
        class_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateClass', {
        class_name: this.name,
        source_code: classSource(this.name),
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateLocalTypes', {
        class_name: this.name,
        local_types_code: 'TYPES ty_probe TYPE i.',
        activate_on_update: false,
      });
    },
  },
  BEHAVIOR_IMPLEMENTATION: {
    name: `ZBP_MDR${S}_R`,
    written: 'implementations',
    async create() {
      recordCreated('DeleteBehaviorImplementation', {
        behavior_implementation_name: this.name,
      });
      await prepare('CreateBehaviorImplementation', {
        class_name: this.name,
        behavior_definition: ROOT,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateBehaviorImplementation', {
        class_name: this.name,
        behavior_definition: ROOT,
        implementation_code: localClass(''),
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateBehaviorImplementation', {
        class_name: this.name,
        behavior_definition: ROOT,
        implementation_code: localClass(
          '  PRIVATE SECTION.\n    DATA mv_probe TYPE i.',
        ),
        activate: false,
      });
    },
  },
  FUNCTION_GROUP: {
    name: `ZMDR${S}FG`,
    written: 'main',
    async create() {
      await functionGroup(this.name);
    },
    async write() {
      await prepare('UpdateFunctionGroup', {
        function_group_name: this.name,
        description: 'Draft live changed',
      });
    },
  },
  FUNCTION_MODULE: {
    name: `Z_MDR${S}_FM`,
    functionGroup: `ZMDR${S}FM`,
    written: 'main',
    async create() {
      const group = this.functionGroup ?? '';
      await functionGroup(group);
      recordCreated('DeleteFunctionModule', {
        function_module_name: this.name,
        function_group_name: group,
      });
      await prepare('CreateFunctionModule', {
        function_group_name: group,
        function_module_name: this.name,
        description: 'Draft live',
      });
      await prepare('UpdateFunctionModule', {
        function_group_name: group,
        function_module_name: this.name,
        source_code: `FUNCTION ${this.name.toLowerCase()}.\n  DATA lv_a TYPE i.\nENDFUNCTION.`,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateFunctionModule', {
        function_group_name: this.functionGroup ?? '',
        function_module_name: this.name,
        source_code: `FUNCTION ${this.name.toLowerCase()}.\n  DATA lv_b TYPE i.\nENDFUNCTION.`,
        activate: false,
      });
    },
  },
  DDL: {
    name: `ZMDR${S}_V`,
    written: 'main',
    async create() {
      recordCreated('DeleteDdl', { ddl_name: this.name });
      await prepare('CreateDdl', {
        ddl_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateDdl', {
        ddl_name: this.name,
        ddl_source: viewSource(this.name, '', false),
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateDdl', {
        ddl_name: this.name,
        ddl_source: viewSource(this.name, ',\n  fld3 as Fld3', false),
        activate: false,
      });
    },
  },
  BEHAVIOR_DEFINITION: {
    name: ROOT,
    written: 'main',
    // Made with the root view in the suite's `before`: the behavior
    // implementation's case, earlier in the list, needs it.
    async create() {},
    async write() {
      await prepare('UpdateBehaviorDefinition', {
        name: ROOT,
        source_code: bdefSource('  field ( readonly ) Fld2;'),
        activate: false,
      });
    },
  },
  METADATA_EXTENSION: {
    name: `ZMDR${S}_X`,
    written: 'main',
    async create() {
      recordCreated('DeleteMetadataExtension', {
        metadata_extension_name: this.name,
      });
      await prepare('CreateMetadataExtension', {
        name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        activate: false,
      });
      await prepare('UpdateMetadataExtension', {
        name: this.name,
        source_code: `@Metadata.layer: #CORE\nannotate entity ${ROOT} with\n{\n  @EndUserText.label: 'Field 1'\n  Fld1;\n}`,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateMetadataExtension', {
        name: this.name,
        source_code: `@Metadata.layer: #CORE\nannotate entity ${ROOT} with\n{\n  @EndUserText.label: 'Field 1'\n  Fld1;\n  @EndUserText.label: 'Field 2'\n  Fld2;\n}`,
        activate: false,
      });
    },
  },
  SERVICE_DEFINITION: {
    name: `ZMDR${S}_SD`,
    written: 'main',
    async create() {
      recordCreated('DeleteServiceDefinition', {
        service_definition_name: this.name,
      });
      await prepare('CreateServiceDefinition', {
        service_definition_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        source_code: `@EndUserText.label: 'Draft live'\ndefine service ${this.name} {\n  expose ${ROOT} as Root;\n}`,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateServiceDefinition', {
        service_definition_name: this.name,
        source_code: `@EndUserText.label: 'Draft live changed'\ndefine service ${this.name} {\n  expose ${ROOT} as Root;\n}`,
        activate: false,
      });
    },
  },
  TABLE: {
    name: `ZMDR${S}T`,
    written: 'main',
    async create() {
      recordCreated('DeleteTable', { table_name: this.name });
      await prepare('CreateTable', {
        table_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
      });
      await prepare('UpdateTable', {
        table_name: this.name,
        ddl_code: tableSource(this.name, ''),
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateTable', {
        table_name: this.name,
        ddl_code: tableSource(this.name, '  note : abap.char(10);'),
        activate: false,
      });
    },
  },
  STRUCTURE: {
    name: `ZMDR${S}S`,
    written: 'main',
    async create() {
      recordCreated('DeleteStructure', { structure_name: this.name });
      await prepare('CreateStructure', {
        structure_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        fields: [{ name: 'f1', type: 'abap.int1' }],
        activate: true,
      });
      await prepare('UpdateStructure', {
        structure_name: this.name,
        ddl_code: structureSource(this.name, ''),
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateStructure', {
        structure_name: this.name,
        ddl_code: structureSource(this.name, '  f2 : abap.char(20);'),
        activate: false,
      });
    },
  },
  DOMAIN: {
    name: `ZMDR${S}_DO`,
    written: 'main',
    async create() {
      recordCreated('DeleteDomain', { domain_name: this.name });
      await prepare('CreateDomain', {
        domain_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        datatype: 'CHAR',
        length: 10,
        decimals: 0,
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateDomain', {
        domain_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        datatype: 'CHAR',
        length: 12,
        decimals: 0,
        activate: false,
      });
    },
  },
  DATA_ELEMENT: {
    name: `ZMDR${S}_DE`,
    written: 'main',
    async create() {
      recordCreated('DeleteDataElement', { data_element_name: this.name });
      await prepare('CreateDataElement', {
        data_element_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        type_kind: 'predefinedAbapType',
        data_type: 'CHAR',
        length: 10,
        decimals: 0,
        short_label: 'Probe',
        medium_label: 'Probe',
        long_label: 'Probe',
        heading_label: 'Probe',
      });
      await prepare('ActivateDataElement', { data_element_name: this.name });
    },
    async write() {
      await prepare('UpdateDataElement', {
        data_element_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        type_kind: 'predefinedAbapType',
        data_type: 'CHAR',
        length: 12,
        decimals: 0,
        activate: false,
      });
    },
  },
  TABLE_TYPE: {
    name: `ZMDR${S}_TT`,
    written: 'main',
    async create() {
      recordCreated('DeleteTableType', { table_type_name: this.name });
      await prepare('CreateTableType', {
        table_type_name: this.name,
        package_name: packageName(),
        description: 'Draft live',
        row_type_kind: 'dictionaryType',
        row_type_name: 'ABAP_BOOLEAN',
        access_type: 'standard',
        key_definition: 'standard',
        key_kind: 'nonUnique',
        activate: true,
      });
    },
    async write() {
      await prepare('UpdateTableType', {
        table_type_name: this.name,
        row_type_kind: 'dictionaryType',
        row_type_name: 'ABAP_BOOLEAN',
        access_type: 'hashed',
        key_definition: 'standard',
        key_kind: 'unique',
        activate: false,
      });
    },
  },
};

/** HandlerGet's name argument per type. */
const NAME_ARGUMENT: Readonly<Record<DraftObjectType, string>> = {
  PROGRAM: 'program_name',
  INCLUDE: 'include_name',
  INTERFACE: 'interface_name',
  CLASS: 'class_name',
  BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
  FUNCTION_MODULE: 'function_module_name',
  FUNCTION_GROUP: 'function_group_name',
  DDL: 'ddl_name',
  BEHAVIOR_DEFINITION: 'behavior_definition_name',
  METADATA_EXTENSION: 'metadata_extension_name',
  SERVICE_DEFINITION: 'service_definition_name',
  TABLE: 'table_name',
  STRUCTURE: 'structure_name',
  DOMAIN: 'domain_name',
  DATA_ELEMENT: 'data_element_name',
  TABLE_TYPE: 'table_type_name',
};

interface PartAnswer {
  readonly part: string;
  readonly draft: unknown;
  readonly changed_at: unknown;
  readonly age_seconds: unknown;
  readonly etags: unknown;
}

interface DraftReading {
  readonly hasDraft: unknown;
  readonly parts: readonly PartAnswer[];
  readonly before: number;
  readonly after: number;
}

function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function readingOf(
  text: string,
  isError: boolean,
  before: number,
  after: number,
): DraftReading {
  if (isError) throw new Error(`the draft read failed: ${text.slice(0, 800)}`);
  const parsed: unknown = JSON.parse(text);
  const parts = member(parsed, 'parts');
  if (!Array.isArray(parts))
    throw new Error(`no parts in ${text.slice(0, 400)}`);
  return {
    hasDraft: member(parsed, 'has_draft'),
    parts: parts.map((part: unknown) => ({
      part: String(member(part, 'part')),
      draft: member(part, 'draft'),
      changed_at: member(part, 'changed_at'),
      age_seconds: member(part, 'age_seconds'),
      etags: member(part, 'etags'),
    })),
    before,
    after,
  };
}

/** A runner answer as a reading, with the clock bounds of its calls. */
function readingOfAnswer(
  answer: LiveAnswer,
  before: number,
  after: number,
): DraftReading {
  return readingOf(answer.text, answer.isError, before, after);
}

/** The recipe of `type`; the case fails when there is none. */
function recipeOf(type: DraftObjectType): Recipe {
  const recipe = RECIPES[type];
  if (recipe === undefined) throw new Error(`no recipe for ${type}`);
  return recipe;
}

/**
 * Both tools' readings at one state: the states asserted on each, and the
 * two alike in `draft`, `changed_at` and the ETags per part.
 */
function assertPair(
  type: DraftObjectType,
  state: 'none' | 'own' | 'other',
  tool: DraftReading,
  part: DraftReading,
): void {
  const written = recipeOf(type).written;
  assertStates(tool, type, written, state);
  assertStates(part, type, written, state);
  assert.deepEqual(comparable(part), comparable(tool));
}

/** The draft as the second user reads it, on its own connection. */
async function viaConnection(
  connection: IAbapConnection,
  tool: string,
  args: ToolArgs,
): Promise<DraftReading> {
  const entry = servedEntries('onprem').get(tool);
  if (entry === undefined) throw new Error(`no ${tool} served on premise`);
  const before = Date.now();
  const answer = toolAnswer(await entry.call({ connection }, args));
  return readingOf(
    answer.content.map((item) => item.text).join('\n'),
    answer.isError === true,
    before,
    Date.now(),
  );
}

/** Both tools' arguments for a type's object. */
function argumentsOf(type: DraftObjectType, recipe: Recipe) {
  const group =
    recipe.functionGroup === undefined
      ? {}
      : { function_group_name: recipe.functionGroup };
  return {
    tool: { object_type: type, object_name: recipe.name, ...group },
    part: {
      object_type: type,
      part: 'draft',
      [NAME_ARGUMENT[type]]: recipe.name,
      ...group,
    },
  };
}

/** Each part's `draft`, `changed_at` and ETags: what both tools answer alike. */
function comparable(reading: DraftReading) {
  return {
    has_draft: reading.hasDraft,
    parts: reading.parts.map(({ part, draft, changed_at, etags }) => ({
      part,
      draft,
      changed_at,
      etags,
    })),
  };
}

/** Asserts the reading's states: `state` for the written part, `none` for every other. */
function assertStates(
  reading: DraftReading,
  type: DraftObjectType,
  written: DraftPart,
  state: 'none' | 'own' | 'other',
): void {
  const timeKnown =
    type !== 'METADATA_EXTENSION' && type !== 'SERVICE_DEFINITION';
  assert.equal(reading.hasDraft, state !== 'none');
  assert.ok(
    reading.parts.some((part) => part.part === written),
    `no ${written} part`,
  );
  for (const part of reading.parts) {
    const expected = part.part === written ? state : 'none';
    assert.equal(part.draft, expected, `${type} ${part.part}`);
    if (expected === 'none' || !timeKnown) {
      assert.equal(part.changed_at, null);
      assert.equal(part.age_seconds, null);
      continue;
    }
    assert.equal(typeof part.changed_at, 'string');
    const changed = Date.parse(String(part.changed_at));
    const age = part.age_seconds;
    assert.equal(typeof age, 'number');
    assert.ok(
      typeof age === 'number' &&
        Math.floor((reading.before - changed) / 1000) <= age &&
        age <= Math.floor((reading.after - changed) / 1000),
      `${type} ${part.part}: age ${String(age)} outside the call's clock bounds`,
    );
  }
}

/** The second user's connection, on premise when the configuration names one. */
async function secondUser(): Promise<
  { connection: IAbapConnection; close: () => Promise<void> } | undefined
> {
  const name = configText(loadTestConfig(), 'draft', 'second_user_env');
  return onprem() && name !== '' ? connectionAs(name) : undefined;
}

liveSuite(
  ['onprem'],
  'GetObjectDraft and HandlerGet part draft: program and include',
  () => {
    let second:
      | { connection: IAbapConnection; close: () => Promise<void> }
      | undefined;

    before(async () => {
      second = await secondUser();
    });

    after(async () => {
      try {
        await deleteRecorded();
      } finally {
        if (second !== undefined) await second.close();
      }
    });

    /** The other state: the second user reads the writer's draft, on premise. */
    async function otherCase(type: DraftObjectType): Promise<void> {
      if (second === undefined) {
        skipRunningTest(
          onprem()
            ? 'draft.second_user_env names no second user'
            : 'the cloud trial has one user',
        );
        return;
      }
      const args = argumentsOf(type, recipeOf(type));
      const tool = await viaConnection(
        second.connection,
        'GetObjectDraft',
        args.tool,
      );
      const part = await viaConnection(
        second.connection,
        'HandlerGet',
        args.part,
      );
      assertPair(type, 'other', tool, part);
    }

    it('PROGRAM: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('PROGRAM');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'PROGRAM',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'PROGRAM',
        part: 'draft',
        program_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'PROGRAM',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'PROGRAM',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'PROGRAM',
        part: 'draft',
        program_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'PROGRAM',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('PROGRAM: other for another user, alike on both tools', async () => {
      await otherCase('PROGRAM');
    });

    it('INCLUDE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('INCLUDE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'INCLUDE',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'INCLUDE',
        part: 'draft',
        include_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'INCLUDE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'INCLUDE',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'INCLUDE',
        part: 'draft',
        include_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'INCLUDE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('INCLUDE: other for another user, alike on both tools', async () => {
      await otherCase('INCLUDE');
    });
  },
);

liveSuite(
  ['onprem', 'cloud'],
  'GetObjectDraft and HandlerGet part draft',
  () => {
    let second:
      | { connection: IAbapConnection; close: () => Promise<void> }
      | undefined;

    before(async () => {
      // The root view and behavior definition the RAP types are built on: the run's own.
      recordCreated('DeleteDdl', { ddl_name: ROOT });
      await prepare('CreateDdl', {
        ddl_name: ROOT,
        package_name: packageName(),
        description: 'Draft live root',
      });
      await prepare('UpdateDdl', {
        ddl_name: ROOT,
        ddl_source: viewSource(ROOT, '', true),
        activate: true,
      });
      recordCreated('DeleteBehaviorDefinition', {
        behavior_definition_name: ROOT,
      });
      await prepare('CreateBehaviorDefinition', {
        name: ROOT,
        package_name: packageName(),
        description: 'Draft live',
        root_entity: ROOT,
        implementation_type: 'Managed',
      });
      await prepare('UpdateBehaviorDefinition', {
        name: ROOT,
        source_code: bdefSource(''),
        activate: true,
      });
      second = await secondUser();
    });

    after(async () => {
      try {
        await deleteRecorded();
      } finally {
        if (second !== undefined) await second.close();
      }
    });

    /** The other state: the second user reads the writer's draft, on premise. */
    async function otherCase(type: DraftObjectType): Promise<void> {
      if (second === undefined) {
        skipRunningTest(
          onprem()
            ? 'draft.second_user_env names no second user'
            : 'the cloud trial has one user',
        );
        return;
      }
      const args = argumentsOf(type, recipeOf(type));
      const tool = await viaConnection(
        second.connection,
        'GetObjectDraft',
        args.tool,
      );
      const part = await viaConnection(
        second.connection,
        'HandlerGet',
        args.part,
      );
      assertPair(type, 'other', tool, part);
    }

    it('INTERFACE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('INTERFACE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'INTERFACE',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'INTERFACE',
        part: 'draft',
        interface_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'INTERFACE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'INTERFACE',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'INTERFACE',
        part: 'draft',
        interface_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'INTERFACE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('INTERFACE: other for another user, alike on both tools', async () => {
      await otherCase('INTERFACE');
    });

    it('CLASS: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('CLASS');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'CLASS',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'CLASS',
        part: 'draft',
        class_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'CLASS',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'CLASS',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'CLASS',
        part: 'draft',
        class_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'CLASS',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('CLASS: other for another user, alike on both tools', async () => {
      await otherCase('CLASS');
    });

    it('BEHAVIOR_IMPLEMENTATION: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('BEHAVIOR_IMPLEMENTATION');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'BEHAVIOR_IMPLEMENTATION',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'BEHAVIOR_IMPLEMENTATION',
        part: 'draft',
        behavior_implementation_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'BEHAVIOR_IMPLEMENTATION',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'BEHAVIOR_IMPLEMENTATION',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'BEHAVIOR_IMPLEMENTATION',
        part: 'draft',
        behavior_implementation_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'BEHAVIOR_IMPLEMENTATION',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('BEHAVIOR_IMPLEMENTATION: other for another user, alike on both tools', async () => {
      await otherCase('BEHAVIOR_IMPLEMENTATION');
    });

    it('FUNCTION_MODULE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('FUNCTION_MODULE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'FUNCTION_MODULE',
        object_name: recipe.name,
        function_group_name: recipe.functionGroup ?? '',
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'FUNCTION_MODULE',
        part: 'draft',
        function_module_name: recipe.name,
        function_group_name: recipe.functionGroup ?? '',
      });
      const noneTo = Date.now();
      assertPair(
        'FUNCTION_MODULE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'FUNCTION_MODULE',
        object_name: recipe.name,
        function_group_name: recipe.functionGroup ?? '',
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'FUNCTION_MODULE',
        part: 'draft',
        function_module_name: recipe.name,
        function_group_name: recipe.functionGroup ?? '',
      });
      const ownTo = Date.now();
      assertPair(
        'FUNCTION_MODULE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('FUNCTION_MODULE: other for another user, alike on both tools', async () => {
      await otherCase('FUNCTION_MODULE');
    });

    it('FUNCTION_GROUP: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('FUNCTION_GROUP');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'FUNCTION_GROUP',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'FUNCTION_GROUP',
        part: 'draft',
        function_group_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'FUNCTION_GROUP',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'FUNCTION_GROUP',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'FUNCTION_GROUP',
        part: 'draft',
        function_group_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'FUNCTION_GROUP',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('FUNCTION_GROUP: other for another user, alike on both tools', async () => {
      await otherCase('FUNCTION_GROUP');
    });

    it('DDL: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('DDL');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'DDL',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'DDL',
        part: 'draft',
        ddl_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'DDL',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'DDL',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'DDL',
        part: 'draft',
        ddl_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'DDL',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('DDL: other for another user, alike on both tools', async () => {
      await otherCase('DDL');
    });

    it('BEHAVIOR_DEFINITION: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('BEHAVIOR_DEFINITION');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'BEHAVIOR_DEFINITION',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'BEHAVIOR_DEFINITION',
        part: 'draft',
        behavior_definition_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'BEHAVIOR_DEFINITION',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'BEHAVIOR_DEFINITION',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'BEHAVIOR_DEFINITION',
        part: 'draft',
        behavior_definition_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'BEHAVIOR_DEFINITION',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('BEHAVIOR_DEFINITION: other for another user, alike on both tools', async () => {
      await otherCase('BEHAVIOR_DEFINITION');
    });

    it('METADATA_EXTENSION: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('METADATA_EXTENSION');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'METADATA_EXTENSION',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'METADATA_EXTENSION',
        part: 'draft',
        metadata_extension_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'METADATA_EXTENSION',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'METADATA_EXTENSION',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'METADATA_EXTENSION',
        part: 'draft',
        metadata_extension_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'METADATA_EXTENSION',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('METADATA_EXTENSION: other for another user, alike on both tools', async () => {
      await otherCase('METADATA_EXTENSION');
    });

    it('SERVICE_DEFINITION: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('SERVICE_DEFINITION');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'SERVICE_DEFINITION',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'SERVICE_DEFINITION',
        part: 'draft',
        service_definition_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'SERVICE_DEFINITION',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'SERVICE_DEFINITION',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'SERVICE_DEFINITION',
        part: 'draft',
        service_definition_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'SERVICE_DEFINITION',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('SERVICE_DEFINITION: other for another user, alike on both tools', async () => {
      await otherCase('SERVICE_DEFINITION');
    });

    it('TABLE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('TABLE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'TABLE',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'TABLE',
        part: 'draft',
        table_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'TABLE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'TABLE',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'TABLE',
        part: 'draft',
        table_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'TABLE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('TABLE: other for another user, alike on both tools', async () => {
      await otherCase('TABLE');
    });

    it('STRUCTURE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('STRUCTURE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'STRUCTURE',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'STRUCTURE',
        part: 'draft',
        structure_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'STRUCTURE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'STRUCTURE',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'STRUCTURE',
        part: 'draft',
        structure_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'STRUCTURE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('STRUCTURE: other for another user, alike on both tools', async () => {
      await otherCase('STRUCTURE');
    });

    it('DOMAIN: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('DOMAIN');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'DOMAIN',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'DOMAIN',
        part: 'draft',
        domain_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'DOMAIN',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'DOMAIN',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'DOMAIN',
        part: 'draft',
        domain_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'DOMAIN',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('DOMAIN: other for another user, alike on both tools', async () => {
      await otherCase('DOMAIN');
    });

    it('DATA_ELEMENT: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('DATA_ELEMENT');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'DATA_ELEMENT',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'DATA_ELEMENT',
        part: 'draft',
        data_element_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'DATA_ELEMENT',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'DATA_ELEMENT',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'DATA_ELEMENT',
        part: 'draft',
        data_element_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'DATA_ELEMENT',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('DATA_ELEMENT: other for another user, alike on both tools', async () => {
      await otherCase('DATA_ELEMENT');
    });

    it('TABLE_TYPE: none after activation and own after an unactivated write, alike on both tools', async () => {
      const recipe = recipeOf('TABLE_TYPE');
      await recipe.create();
      const noneFrom = Date.now();
      const noneTool = await liveCall('GetObjectDraft', {
        object_type: 'TABLE_TYPE',
        object_name: recipe.name,
      });
      const nonePart = await liveCall('HandlerGet', {
        object_type: 'TABLE_TYPE',
        part: 'draft',
        table_type_name: recipe.name,
      });
      const noneTo = Date.now();
      assertPair(
        'TABLE_TYPE',
        'none',
        readingOfAnswer(noneTool, noneFrom, noneTo),
        readingOfAnswer(nonePart, noneFrom, noneTo),
      );
      await recipe.write();
      const ownFrom = Date.now();
      const ownTool = await liveCall('GetObjectDraft', {
        object_type: 'TABLE_TYPE',
        object_name: recipe.name,
      });
      const ownPart = await liveCall('HandlerGet', {
        object_type: 'TABLE_TYPE',
        part: 'draft',
        table_type_name: recipe.name,
      });
      const ownTo = Date.now();
      assertPair(
        'TABLE_TYPE',
        'own',
        readingOfAnswer(ownTool, ownFrom, ownTo),
        readingOfAnswer(ownPart, ownFrom, ownTo),
      );
    });

    it('TABLE_TYPE: other for another user, alike on both tools', async () => {
      await otherCase('TABLE_TYPE');
    });
  },
);
