/**
 * The input schemas each binary's server actually registers, read from the
 * server as a client reads them (`tools/list`): Streamable HTTP over real
 * HTTP, SSE over a real SSE stream, stdio over an in-memory transport.
 *
 * - On the four Streamable HTTP binaries every tool declares an optional
 *   string `state_handle` with the one description; a tool that declares its
 *   own (the debugger's) keeps it, required where it is required.
 * - stdio and SSE register the schemas they always registered: their
 *   fixture is the one recorded before the HTTP declaration existed, and an
 *   HTTP schema is that schema plus the declaration and nothing else.
 *
 * `WRITE_TRANSPORT_SURFACE=1 npm test -- src/__tests__/unit/toolSet/transportSurface.test.ts`
 * writes both fixtures first (refused under CI).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import {
  binOf,
  httpFixture as httpFixtureOf,
  KINDS,
  renderSurface,
  type Schema,
  SESSION_TOOLS,
  type Surface,
  stdioSseFixture as stdioSseFixtureOf,
  transportSurfaces,
} from '../../helpers/fixtureRenderings';

jest.setTimeout(120_000);

/** The words of the declared `state_handle` (spec §1). */
const STATE_HANDLE_WORDS =
  'The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.';

const FIXTURES = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'tools',
);
const HTTP_FIXTURE = path.join(FIXTURES, 'http-surface.json');
const STDIO_SSE_FIXTURE = path.join(FIXTURES, 'stdio-sse-surface.json');

describe('the schemas each binary registers (WRITE_TRANSPORT_SURFACE=1 rewrites the fixtures)', () => {
  let standIn: AdtStandIn;
  const http: Surface = {};
  const stdio: Surface = {};
  const sse: Surface = {};
  let savedSystemType: string | undefined;

  const httpFixture = () => httpFixtureOf(http);
  const stdioSseFixture = () => stdioSseFixtureOf(stdio, sse);

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    resetProcessLatchForTests();
    // No system kind stated: nothing filtered, every tool of the set listed.
    savedSystemType = process.env.SAP_SYSTEM_TYPE;
    delete process.env.SAP_SYSTEM_TYPE;
    standIn = await adtStandIn();
    const surfaces = await transportSurfaces(standIn);
    Object.assign(http, surfaces.http);
    Object.assign(stdio, surfaces.stdio);
    Object.assign(sse, surfaces.sse);
    if (process.env.WRITE_TRANSPORT_SURFACE === '1') {
      if (process.env.CI)
        throw new Error('the fixtures are not written under CI');
      fs.writeFileSync(HTTP_FIXTURE, renderSurface(httpFixture()));
      fs.writeFileSync(STDIO_SSE_FIXTURE, renderSurface(stdioSseFixture()));
    }
  });

  afterAll(async () => {
    await standIn?.close();
    if (savedSystemType !== undefined)
      process.env.SAP_SYSTEM_TYPE = savedSystemType;
    jest.restoreAllMocks();
  });

  const read = (file: string): unknown =>
    JSON.parse(fs.readFileSync(file, 'utf8'));

  it('lists every tool of every binary, so the assertions below are not vacuous', () => {
    const counts = (surface: Surface) =>
      Object.values(surface).map((tools) => Object.keys(tools).length);
    for (const surface of [http, stdio, sse]) {
      expect(Object.keys(surface)).toHaveLength(4);
      for (const count of counts(surface)) expect(count).toBeGreaterThan(15);
    }
  });

  it('stdio registers exactly the schemas of the fixture, and SSE the same schemas', () => {
    expect(stdioSseFixture()).toEqual(read(STDIO_SSE_FIXTURE));
    for (const kind of KINDS) {
      const stdioTools = stdio[binOf('stdio', kind)] ?? {};
      for (const [name, schema] of Object.entries(
        sse[binOf('sse', kind)] ?? {},
      )) {
        expect({ name, schema }).toEqual({ name, schema: stdioTools[name] });
      }
    }
  });

  it('the HTTP binaries register exactly the tools and inputs of their fixture', () => {
    expect(httpFixture()).toEqual(read(HTTP_FIXTURE));
  });

  it('every HTTP binary serves the tools of its SSE binary and its long-session tools, which no stdio or SSE binary serves', () => {
    for (const kind of KINDS) {
      const httpTools = http[binOf('http', kind)] ?? {};
      const sseTools = sse[binOf('sse', kind)] ?? {};
      const stdioTools = stdio[binOf('stdio', kind)] ?? {};
      expect({ kind, tools: Object.keys(httpTools).sort() }).toEqual({
        kind,
        tools: [...Object.keys(sseTools), ...SESSION_TOOLS[kind]].sort(),
      });
      for (const tool of Object.values(SESSION_TOOLS).flat()) {
        expect(sseTools[tool]).toBeUndefined();
        expect(stdioTools[tool]).toBeUndefined();
      }
    }
  });

  it('on every HTTP binary every tool declares state_handle — the SSE schema plus that and nothing else; the debugger keeps its own', () => {
    for (const kind of KINDS) {
      const httpTools = http[binOf('http', kind)] ?? {};
      const sseTools = sse[binOf('sse', kind)] ?? {};
      for (const [name, schema] of Object.entries(httpTools)) {
        if (SESSION_TOOLS[kind].includes(name)) {
          // HTTP's own: declared like every other tool, optional.
          expect({
            name,
            state_handle: schema.properties?.state_handle,
            required: (schema.required ?? []).includes('state_handle'),
          }).toEqual({
            name,
            state_handle: { type: 'string', description: STATE_HANDLE_WORDS },
            required: false,
          });
          continue;
        }
        const before = sseTools[name] as Schema;
        if (before.properties?.state_handle !== undefined) {
          // Declared by the tool itself: kept as it is, requiredness included.
          expect({ name, schema }).toEqual({ name, schema: before });
          continue;
        }
        expect({ name, state_handle: schema.properties?.state_handle }).toEqual(
          {
            name,
            state_handle: { type: 'string', description: STATE_HANDLE_WORDS },
          },
        );
        // The declaration and nothing else: optional, every other key as SSE's.
        const { state_handle: _added, ...rest } = schema.properties ?? {};
        expect({ name, schema: { ...schema, properties: rest } }).toEqual({
          name,
          schema: { ...before, properties: before.properties ?? {} },
        });
      }
    }
  });

  it('the debugger tools declare their own state_handle, required where required', () => {
    const own = Object.entries(sse[binOf('sse', 'core')] ?? {}).filter(
      ([, schema]) => schema.properties?.state_handle !== undefined,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.some(([, schema]) => schema.required?.includes('state_handle')),
    ).toBe(true);
  });
});
