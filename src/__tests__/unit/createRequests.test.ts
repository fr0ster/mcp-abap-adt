/**
 * What a create tool sends, run on `recordingConnection` with real
 * adt-clients code (plan D2, step 6; adt-clients 43.0.0):
 *
 * - **#348, the create language.** SAP takes a new object's original language
 *   from the request's logon language and ignores the body's (measured on the
 *   cloud). A create given `master_language` writes `adtcore:language` and
 *   `adtcore:masterLanguage` and sends `sap-language`, all that value; given
 *   none but a session language (`SAP_LANGUAGE` / `x-sap-language`), the same
 *   with the session's; given neither, it writes no language attribute and
 *   sends no `sap-language` header.
 * - **#8, an escaped description.** The description is written into the
 *   create body as an attribute value: with `&`, `<`, `>`, `"` and `'` in
 *   it, the body stays well-formed and an XML parser reads the description
 *   back whole.
 *
 * Every full `Create<Type>` and every compact `HandlerCreate` type that
 * takes `master_language`, on each variant that serves it. The create
 * request is the POST whose body writes `adtcore:description`.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { listedTool, statedEnvironment } from '../../lib/listedTool';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { jsonFind, listedJson } from '../helpers/listedJson';
import {
  type PinnedRequest,
  recordCase,
  servedEntries,
} from '../helpers/pinCases';
import type { SystemKind } from '../helpers/servedTools';

type Args = Readonly<Record<string, unknown>>;

/** One create: the tool, its arguments without a description or a language. */
interface CreateCase {
  readonly tool: string;
  readonly args: Args;
}

const FULL_CREATES: readonly CreateCase[] = [
  {
    tool: 'CreateBehaviorDefinition',
    args: {
      name: 'ZPIN_BDEF',
      package_name: 'ZPIN_PKG',
      root_entity: 'ZPIN_ROOT',
      implementation_type: 'Managed',
      activate: false,
    },
  },
  {
    tool: 'CreateClass',
    args: { class_name: 'ZCL_PIN', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateDataElement',
    args: {
      data_element_name: 'ZPIN_DTEL',
      package_name: 'ZPIN_PKG',
    },
  },
  {
    tool: 'CreateDdl',
    args: { ddl_name: 'ZPIN_DDL', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateMetadataExtension',
    args: { name: 'ZPIN_DDLX', package_name: 'ZPIN_PKG', activate: false },
  },
  {
    tool: 'CreateDomain',
    args: {
      domain_name: 'ZPIN_DOMA',
      package_name: 'ZPIN_PKG',
      activate: false,
    },
  },
  {
    tool: 'CreateFunctionGroup',
    args: {
      function_group_name: 'ZPIN_FUGR',
      package_name: 'ZPIN_PKG',
      activate: false,
    },
  },
  {
    tool: 'CreateInclude',
    args: { include_name: 'ZPIN_INCL', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateInterface',
    args: { interface_name: 'ZIF_PIN', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateMessageClass',
    args: { message_class_name: 'ZPIN_MSAG', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreatePackage',
    args: { package_name: 'ZPIN_DEVC', super_package: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateProgram',
    args: { program_name: 'ZPIN_PROG', package_name: 'ZPIN_PKG' },
  },
  {
    tool: 'CreateServiceBinding',
    args: {
      service_binding_name: 'ZPIN_SRVB',
      service_definition_name: 'ZPIN_SRVD',
      package_name: 'ZPIN_PKG',
      activate: false,
    },
  },
  {
    tool: 'CreateServiceDefinition',
    args: {
      service_definition_name: 'ZPIN_SRVD',
      package_name: 'ZPIN_PKG',
      activate: false,
    },
  },
  {
    tool: 'CreateStructure',
    args: {
      structure_name: 'ZPIN_STRU',
      package_name: 'ZPIN_PKG',
      fields: [{ name: 'FIELD1', data_type: 'CHAR', length: 10 }],
      activate: false,
    },
  },
  {
    tool: 'CreateTable',
    args: { table_name: 'ZPIN_TABL', package_name: 'ZPIN_PKG' },
  },
];

/** `HandlerCreate`'s types that take `master_language`, each with its name argument. */
const COMPACT_CREATES: readonly CreateCase[] = [
  { object_type: 'PACKAGE', super_package: 'ZPIN_PKG' },
  { object_type: 'DOMAIN', domain_name: 'ZPIN_DOMA' },
  { object_type: 'DATA_ELEMENT', data_element_name: 'ZPIN_DTEL' },
  { object_type: 'TABLE', table_name: 'ZPIN_TABL' },
  { object_type: 'STRUCTURE', structure_name: 'ZPIN_STRU' },
  { object_type: 'TABLE_TYPE', table_type_name: 'ZPIN_TTYP' },
  { object_type: 'DDL', ddl_name: 'ZPIN_DDL' },
  { object_type: 'SERVICE_DEFINITION', service_definition_name: 'ZPIN_SRVD' },
  {
    object_type: 'SERVICE_BINDING',
    service_binding_name: 'ZPIN_SRVB',
    service_definition_name: 'ZPIN_SRVD',
  },
  { object_type: 'CLASS', class_name: 'ZCL_PIN' },
  { object_type: 'PROGRAM', program_name: 'ZPIN_PROG' },
  { object_type: 'INCLUDE', include_name: 'ZPIN_INCL' },
  { object_type: 'INTERFACE', interface_name: 'ZIF_PIN' },
  { object_type: 'FUNCTION_GROUP', function_group_name: 'ZPIN_FUGR' },
  {
    object_type: 'BEHAVIOR_DEFINITION',
    name: 'ZPIN_BDEF',
    implementation_type: 'Managed',
  },
  { object_type: 'METADATA_EXTENSION', name: 'ZPIN_DDLX' },
].map((args) => ({
  tool: 'HandlerCreate',
  args: {
    ...args,
    package_name: args.object_type === 'PACKAGE' ? 'ZPIN_DEVC' : 'ZPIN_PKG',
  },
}));

const VARIANTS: readonly SystemKind[] = ['onprem', 'cloud'];

/** Whether `variant` serves `c`: its tool, and for `HandlerCreate` its type. */
function serves(variant: SystemKind, c: CreateCase): boolean {
  const entry = servedEntries(variant).get(c.tool);
  if (entry === undefined) return false;
  const type = c.args.object_type;
  if (typeof type !== 'string') return true;
  const listed = listedTool(entry.toolDefinition, statedEnvironment(variant));
  if (!listed.listed) return false;
  const values = jsonFind(listedJson(listed.inputSchema), 'object_type')?.enum;
  return values?.includes(type) === true;
}

/** Each case on each variant that serves it, with its test name. */
function served(cases: readonly CreateCase[]) {
  return cases.flatMap((c) =>
    VARIANTS.filter((variant) => serves(variant, c)).map((variant) => ({
      name: `${c.tool}${typeof c.args.object_type === 'string' ? ` ${c.args.object_type}` : ''} (${variant})`,
      variant,
      c,
    })),
  );
}

const FULL = served(FULL_CREATES);
const COMPACT = served(COMPACT_CREATES);

/** The requests `c` sends on `variant` with `extra` among its arguments. */
async function sent(
  c: CreateCase,
  variant: SystemKind,
  extra: Args,
): Promise<PinnedRequest[]> {
  const recording = await recordCase({
    tool: c.tool,
    variant,
    stand: 'recording',
    args: { ...c.args, ...extra },
    expected: 'none',
  });
  return recording.requests;
}

/** The create request: the one POST whose body writes `adtcore:description`. */
function createOf(requests: readonly PinnedRequest[]): PinnedRequest {
  const creates = requests.filter(
    (request) =>
      request.method === 'POST' &&
      request.body?.includes('adtcore:description=') === true,
  );
  const [only] = creates;
  if (only === undefined || creates.length !== 1) {
    throw new Error(
      `${creates.length} create requests; sent:\n${JSON.stringify(requests, null, 2)}`,
    );
  }
  return only;
}

/** The value of the header `name` in `request`, its name in any case. */
function headerOf(request: PinnedRequest, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** The language attributes and header `request` carries. */
function languageOf(request: PinnedRequest) {
  const body = request.body ?? '';
  return {
    language: body.includes('adtcore:language='),
    masterLanguage: body.includes('adtcore:masterLanguage='),
    header: headerOf(request, 'sap-language'),
  };
}

const ALL = [...FULL, ...COMPACT];

let savedLanguage: string | undefined;
beforeEach(() => {
  savedLanguage = process.env.SAP_LANGUAGE;
  delete process.env.SAP_LANGUAGE;
  // A create states its responsible person: from the settings here.
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
  if (savedLanguage === undefined) delete process.env.SAP_LANGUAGE;
  else process.env.SAP_LANGUAGE = savedLanguage;
});

describe('a create states its language once (#348)', () => {
  it('runs every create that takes master_language on a variant', () => {
    expect(FULL.map((each) => each.c.tool)).toEqual(
      expect.arrayContaining(FULL_CREATES.map((c) => c.tool)),
    );
    expect(
      COMPACT_CREATES.filter((c) => !COMPACT.some((each) => each.c === c)).map(
        (c) => c.args.object_type,
      ),
    ).toEqual([]);
  });

  it.each(ALL)(
    '$name: master_language given — body and header carry it',
    async ({ c, variant }) => {
      const create = createOf(
        await sent(c, variant, {
          description: 'Pin language',
          master_language: 'DE',
        }),
      );
      expect(create.body).toContain('adtcore:language="DE"');
      expect(create.body).toContain('adtcore:masterLanguage="DE"');
      expect(headerOf(create, 'sap-language')).toBe('DE');
    },
  );

  it.each(ALL)(
    '$name: the session language — body and header carry it',
    async ({ c, variant }) => {
      setSystemContext({ masterLanguage: 'FR' });
      const create = createOf(
        await sent(c, variant, { description: 'Pin language' }),
      );
      expect(create.body).toContain('adtcore:language="FR"');
      expect(create.body).toContain('adtcore:masterLanguage="FR"');
      expect(headerOf(create, 'sap-language')).toBe('FR');
    },
  );

  it.each(ALL)(
    '$name: no language anywhere — neither attribute nor header',
    async ({ c, variant }) => {
      const requests = await sent(c, variant, { description: 'Pin language' });
      createOf(requests);
      for (const request of requests) {
        expect(languageOf(request)).toEqual({
          language: false,
          masterLanguage: false,
          header: undefined,
        });
      }
    },
  );
});

/** A description holding every character an attribute value escapes. */
const ESCAPED_DESCRIPTION = `Pin & <esc> "q" 'a'`;

/** The root element's `adtcore:description` of `body`, read by an XML parser. */
function rootDescription(body: string | undefined): unknown {
  const text = body ?? '';
  expect(XMLValidator.validate(text)).toBe(true);
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
  }).parse(text);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const root = Object.entries(parsed).find(([name]) => !name.startsWith('?'));
  const element = root?.[1];
  if (typeof element !== 'object' || element === null) return undefined;
  return Reflect.get(element, '@adtcore:description');
}

/**
 * `CreateTable` and `HandlerCreate` `TABLE` write the table's name as its
 * description: the table's description is its DDL source's
 * (`handleCreateTable.ts`), so there is nothing of the caller's to escape.
 */
const DESCRIBED = ALL.filter(
  ({ c }) => c.tool !== 'CreateTable' && c.args.object_type !== 'TABLE',
);

describe('a create escapes its description (#8)', () => {
  it.each(DESCRIBED)(
    '$name: the body is well-formed and the description whole',
    async ({ c, variant }) => {
      const create = createOf(
        await sent(c, variant, {
          description: ESCAPED_DESCRIPTION,
          master_language: 'EN',
        }),
      );
      expect(rootDescription(create.body)).toBe(ESCAPED_DESCRIPTION);
    },
  );
});

/** What `master_language` does, as every create lists it. */
const MASTER_LANGUAGE_WORDS =
  "Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.";

describe('master_language says what a create does with it', () => {
  it.each(
    [...FULL_CREATES.map((c) => c.tool), 'HandlerCreate'].flatMap((tool) =>
      VARIANTS.filter((variant) => servedEntries(variant).has(tool)).map(
        (variant) => ({ tool, variant }),
      ),
    ),
  )('$tool ($variant)', ({ tool, variant }) => {
    const entry = servedEntries(variant).get(tool);
    if (entry === undefined) throw new Error(`${variant} lists no ${tool}`);
    const listed = listedTool(entry.toolDefinition, statedEnvironment(variant));
    if (!listed.listed) throw new Error(`${variant} lists no ${tool}`);
    expect(
      jsonFind(listedJson(listed.inputSchema), 'master_language')?.description,
    ).toBe(MASTER_LANGUAGE_WORDS);
  });
});
