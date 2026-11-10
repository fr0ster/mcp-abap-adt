/**
 * Integration tests for the program include (PROG/I) tools, high and compact.
 *
 * **Where it runs: on premise only** (`create_include` / `builder_include`,
 * `available_in: ["onprem"]`): ABAP cloud holds no program include of the
 * caller's, and the include writes are not offered there. Elsewhere — a cloud
 * system, or no integration configuration at all — the case skips and says
 * why (LambdaTester: "not available on cloud", "No configuration found").
 * The second describe is its cloud counterpart (`include_cloud_read`, cloud
 * only): `tools/list` without an include write, and the reads of a delivered
 * include the configuration names.
 *
 * Lifecycle, one run, every object of its own:
 *   CreatePackage ($ZMCP_I<run>, local, no transport)
 *   -> CreateInclude -> GetInclude source (SAP's comment header, no code) and
 *      metadata, both at `workingArea`: the include has no active version yet
 *   -> UpdateInclude activate:true -> source reads back equal, GetInactiveObjects
 *      lists nothing of it
 *   -> UpdateIncludeMetadata (description changed) -> metadata reads back changed
 *   -> ActivateIncludeLow -> ActivateObjects PROG/I
 *   -> compact HandlerLock, HandlerUpdate (source, then part 'metadata'),
 *      HandlerUnlock, HandlerGet both parts, HandlerValidate (a free name),
 *      HandlerDeletionCheck, HandlerActivate
 *   -> DeleteInclude -> CreateInclude of the same name right after (SAP's
 *      answer recorded as sent; when it creates, deleted again, absence read)
 *   -> a second include through HandlerCreate / HandlerDelete
 *   -> afterAll: whatever is left deleted, the package last; SearchObject by
 *      the run's names answers no hit.
 *
 * The objects are deleted in afterAll whatever the outcome: a run on a shared
 * system leaves nothing behind (the owner's rule for these live suites).
 *
 * Run: MCP_TEST_CONFIG=<config> npm test -- src/__tests__/integration/high/include/IncludeHighHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { handleHandlerActivate } from '../../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerCreate } from '../../../../../compact-modify/src/handlers/handleHandlerCreate';
import { handleHandlerDelete } from '../../../../../compact-modify/src/handlers/handleHandlerDelete';
import { handleHandlerLock } from '../../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUnlock } from '../../../../../compact-modify/src/handlers/handleHandlerUnlock';
import { handleHandlerUpdate } from '../../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleHandlerDeletionCheck } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import { handleHandlerGet } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleHandlerValidate } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { EmbeddableMcpServer } from '../../../../embeddable/EmbeddableMcpServer';
import { handleActivateObjects } from '../../../../handlers/common/high/handleActivateObjects';
import { handleCreateInclude } from '../../../../handlers/include/high/handleCreateInclude';
import { handleDeleteInclude } from '../../../../handlers/include/high/handleDeleteInclude';
import { handleUpdateInclude } from '../../../../handlers/include/high/handleUpdateInclude';
import { handleUpdateIncludeMetadata } from '../../../../handlers/include/high/handleUpdateIncludeMetadata';
import { handleActivateInclude } from '../../../../handlers/include/low/handleActivateInclude';
import { handleGetInclude } from '../../../../handlers/include/readonly/handleGetInclude';
import { handleCreatePackage } from '../../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/high/handleDeletePackage';
import { handleSearchObject } from '../../../../handlers/search/readonly/handleSearchObject';
import { handleGetInactiveObjects } from '../../../../handlers/system/readonly/handleGetInactiveObjects';
import { CompactHandlersGroup } from '../../../../lib/compact/group';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../../lib/handlers/registry/CompositeHandlersRegistry';
import { patchXmlAttribute } from '../../../../lib/strategies/xmlPatch';
import { getSystemType } from '../../helpers/configHelpers';
import { assertEquals } from '../../helpers/liveAssert';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { McpSession } from '../../helpers/testers/hardMode';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/** A tool's answer as the model reads it: the error flag and the first text. */
type Answer = { isError: boolean; text: string };

/** Read a handler's result (typed `unknown` by the compact routes). */
function answerOf(value: unknown): Answer {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Not a tool answer: ${String(value)}`);
  }
  const isError = 'isError' in value && value.isError === true;
  const content = 'content' in value ? value.content : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '';
  return { isError, text };
}

/** A field of a parsed JSON value, or `undefined`. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return key in value ? Reflect.get(value, key) : undefined;
}

/** A tool's JSON text, parsed; `undefined` when it is not JSON. */
function parsed(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

/** Source text compared as ABAP keeps it: line ends and trailing blanks aside. */
function normalisedSource(source: string): string {
  return source.split('\r\n').join('\n').trimEnd();
}

/** A run-unique suffix: five characters of A–Z and 0–9. */
function runSuffix(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return suffix;
}

const RUN = runSuffix();
const PACKAGE = `$ZMCP_I${RUN}`;
const NAME_PREFIX = `ZMCP_IT_IN_${RUN}`;
const INCLUDE = `${NAME_PREFIX}A`;
const COMPACT_INCLUDE = `${NAME_PREFIX}B`;
const FREE_NAME = `${NAME_PREFIX}Z`;

const logger = createTestLogger('incl-high');

describe('Include High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  /** Set once the case runs here: only then is absence read back. */
  let ran = false;
  let handlerContext: HandlerContext | undefined;
  /** What this run created and has not deleted yet, in creation order. */
  const created: Array<{ kind: 'package' | 'include'; name: string }> = [];
  /** A compact lock this run holds, released before any delete. */
  let heldLock: { name: string; handle: string } | undefined;
  /** Each step's answer, for the log the run is read from. */
  const record = (label: string, answer: Answer) =>
    logger?.info(
      `[answer] ${label}: ${answer.isError ? 'isError ' : ''}${answer.text}`,
    );

  const forget = (name: string) => {
    const index = created.findIndex((entry) => entry.name === name);
    if (index >= 0) created.splice(index, 1);
  };

  /** Delete everything still listed, the package last. Idempotent. */
  const deleteEverything = async () => {
    const context = handlerContext;
    if (context === undefined) return;
    if (heldLock !== undefined) {
      const lock = heldLock;
      heldLock = undefined;
      record(
        `cleanup HandlerUnlock ${lock.name}`,
        answerOf(
          await handleHandlerUnlock(context, {
            object_type: 'INCLUDE',
            object_name: lock.name,
            lock_handle: lock.handle,
          }),
        ),
      );
    }
    for (const entry of [...created].reverse()) {
      if (entry.kind !== 'include') continue;
      const answer = answerOf(
        await handleDeleteInclude(context, { include_name: entry.name }),
      );
      record(`cleanup DeleteInclude ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
    for (const entry of [...created]) {
      if (entry.kind !== 'package') continue;
      const answer = answerOf(
        await handleDeletePackage(context, {
          package_name: entry.name,
          force_new_connection: true,
        }),
      );
      record(`cleanup DeletePackage ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
  };

  before(async () => {
    tester = new LambdaTester('create_include', 'builder_include', 'incl-high');
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        if (context.hasConfig) {
          handlerContext = createHandlerContext({
            connection: context.connection,
            logger: context.logger,
          });
        }
      },
      async () => deleteEverything(),
    );
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  after(async () => {
    await tester.afterAll(async () => {
      // Whatever the outcome, nothing of the run stays.
      await deleteEverything();
      const context = handlerContext;
      if (context === undefined || !ran) return;
      const includes = answerOf(
        await handleSearchObject(context, { object_name: `${NAME_PREFIX}*` }),
      );
      record(`absence SearchObject ${NAME_PREFIX}*`, includes);
      const pkg = answerOf(
        await handleSearchObject(context, {
          object_name: PACKAGE,
          object_type: 'DEVC',
        }),
      );
      record(`absence SearchObject ${PACKAGE}`, pkg);
      assertEquals(created, []);
      assert.equal(includes.isError, false);
      assert.equal(includes.text.includes(NAME_PREFIX), false);
      assert.equal(pkg.isError, false);
      assert.equal(pkg.text.includes(PACKAGE), false);
    });
  });

  it('creates, writes, reads, activates and deletes an include, high and compact', async () => {
    await tester.run(async (ctx: LambdaTesterContext) => {
      const context = handlerContext;
      if (context === undefined) throw new Error('No handler context');
      ran = true;
      const params = ctx.params;
      const description: string =
        params.description || 'Include for the include high-level tests';
      const source: string = params.update_source_code;
      if (!source) throw new Error('update_source_code is required');

      /** A step that must succeed: its answer, or the test ends with it. */
      const must = async (label: string, call: () => Promise<unknown>) => {
        const answer = answerOf(await call());
        record(label, answer);
        if (answer.isError) {
          throw new Error(`${label} was refused: ${answer.text}`);
        }
        return answer;
      };

      // The package of the run: local, no transport.
      await must(`CreatePackage ${PACKAGE}`, () =>
        handleCreatePackage(context, {
          package_name: PACKAGE,
          super_package: '$TMP',
          description: `Include suite run ${RUN}`,
          package_type: 'development',
          software_component: 'LOCAL',
        }),
      );
      created.push({ kind: 'package', name: PACKAGE });

      // CreateInclude: inactive, with the comment header SAP writes.
      await must(`CreateInclude ${INCLUDE}`, () =>
        handleCreateInclude(context, {
          include_name: INCLUDE,
          package_name: PACKAGE,
          description,
        }),
      );
      created.push({ kind: 'include', name: INCLUDE });

      // GetInclude, both parts: a source of no code, the document. SAP
      // writes a comment header naming the include into the new one
      // (measured on premise, 2026-11-01: three `*&` comment lines, the
      // name in lower case).
      const emptySource = await must(`GetInclude ${INCLUDE} source`, () =>
        handleGetInclude(context, {
          include_name: INCLUDE,
          version: 'workingArea',
        }),
      );
      const headerLines = normalisedSource(emptySource.text)
        .split('\n')
        .filter((line) => line.trim() !== '');
      assert.equal(
        headerLines.every((line) => line.startsWith('*')),
        true,
      );
      assert.equal(
        headerLines.some((line) => line.includes(INCLUDE.toLowerCase())),
        true,
      );
      const firstMetadata = await must(`GetInclude ${INCLUDE} metadata`, () =>
        handleGetInclude(context, {
          include_name: INCLUDE,
          part: 'metadata',
          version: 'workingArea',
        }),
      );
      const document = field(parsed(firstMetadata.text), 'metadata');
      if (typeof document !== 'string') {
        throw new Error(`GetInclude metadata answered no document`);
      }
      assert.equal(document.includes(INCLUDE), true);
      assert.equal(
        document.includes(`adtcore:description="${description}"`),
        true,
      );

      // UpdateInclude, activated; the source reads back equal.
      await must(`UpdateInclude ${INCLUDE} activate`, () =>
        handleUpdateInclude(context, {
          include_name: INCLUDE,
          source_code: source,
          activate: true,
        }),
      );
      const written = await must(`GetInclude ${INCLUDE} source (active)`, () =>
        handleGetInclude(context, { include_name: INCLUDE }),
      );
      assert.equal(normalisedSource(written.text), normalisedSource(source));
      const inactive = await must('GetInactiveObjects', () =>
        handleGetInactiveObjects(context, {}),
      );
      assert.equal(inactive.text.includes(INCLUDE), false);

      // UpdateIncludeMetadata: the document with its description changed.
      // Its answer measures the include.updateMetadata header pair.
      const changedDescription = `${description} (metadata ${RUN})`;
      await must(`UpdateIncludeMetadata ${INCLUDE}`, () =>
        handleUpdateIncludeMetadata(context, {
          include_name: INCLUDE,
          metadata: patchXmlAttribute(
            document,
            'adtcore:description',
            changedDescription,
          ),
        }),
      );
      const changed = await must(`GetInclude ${INCLUDE} metadata (after)`, () =>
        handleGetInclude(context, {
          include_name: INCLUDE,
          part: 'metadata',
          version: 'workingArea',
        }),
      );
      const changedDocument = field(parsed(changed.text), 'metadata');
      if (typeof changedDocument !== 'string') {
        throw new Error('GetInclude metadata answered no document');
      }
      assert.equal(
        changedDocument.includes(`adtcore:description="${changedDescription}"`),
        true,
      );

      await must(`ActivateIncludeLow ${INCLUDE}`, () =>
        handleActivateInclude(context, { include_name: INCLUDE }),
      );
      await must(`ActivateObjects ${INCLUDE} PROG/I`, () =>
        handleActivateObjects(context, {
          objects: [{ name: INCLUDE, type: 'PROG/I' }],
        }),
      );

      // Compact: lock, write the source, then the metadata, unlock.
      const locked = answerOf(
        await handleHandlerLock(context, {
          object_type: 'INCLUDE',
          object_name: INCLUDE,
        }),
      );
      // The lock's answer carries the handle: never logged.
      logger?.info(
        `[answer] HandlerLock INCLUDE ${INCLUDE}: ${locked.isError ? `isError ${locked.text}` : 'locked'}`,
      );
      if (locked.isError) {
        throw new Error(`HandlerLock was refused: ${locked.text}`);
      }
      const handle = field(parsed(locked.text), 'lock_handle');
      if (typeof handle !== 'string' || handle === '') {
        throw new Error('HandlerLock answered no lock handle');
      }
      heldLock = { name: INCLUDE, handle };

      const compactSource = `${source}* written through HandlerUpdate ${RUN}\n`;
      await must(`HandlerUpdate INCLUDE ${INCLUDE} source`, () =>
        handleHandlerUpdate(context, {
          object_type: 'INCLUDE',
          include_name: INCLUDE,
          source_code: compactSource,
          lock_handle: handle,
        }),
      );
      const compactRead = await must(
        `HandlerGet INCLUDE ${INCLUDE} metadata`,
        () =>
          handleHandlerGet(context, {
            object_type: 'INCLUDE',
            include_name: INCLUDE,
            part: 'metadata',
            version: 'workingArea',
          }),
      );
      const compactDocument = field(parsed(compactRead.text), 'metadata');
      if (typeof compactDocument !== 'string') {
        throw new Error('HandlerGet metadata answered no document');
      }
      const compactDescription = `${description} (compact ${RUN})`;
      await must(`HandlerUpdate INCLUDE ${INCLUDE} metadata`, () =>
        handleHandlerUpdate(context, {
          object_type: 'INCLUDE',
          include_name: INCLUDE,
          part: 'metadata',
          source_code: patchXmlAttribute(
            compactDocument,
            'adtcore:description',
            compactDescription,
          ),
          lock_handle: handle,
        }),
      );
      await must(`HandlerUnlock INCLUDE ${INCLUDE}`, () =>
        handleHandlerUnlock(context, {
          object_type: 'INCLUDE',
          object_name: INCLUDE,
          lock_handle: handle,
        }),
      );
      heldLock = undefined;

      const inactiveSource = await must(
        `HandlerGet INCLUDE ${INCLUDE} source (inactive)`,
        () =>
          handleHandlerGet(context, {
            object_type: 'INCLUDE',
            include_name: INCLUDE,
            version: 'inactive',
          }),
      );
      const readSource = field(parsed(inactiveSource.text), 'source');
      assert.equal(typeof readSource, 'string');
      assert.equal(
        normalisedSource(String(readSource)),
        normalisedSource(compactSource),
      );
      const compactMetadata = await must(
        `HandlerGet INCLUDE ${INCLUDE} metadata (after)`,
        () =>
          handleHandlerGet(context, {
            object_type: 'INCLUDE',
            include_name: INCLUDE,
            part: 'metadata',
            version: 'workingArea',
          }),
      );
      const compactChanged = field(parsed(compactMetadata.text), 'metadata');
      assert.equal(typeof compactChanged, 'string');
      assert.equal(
        String(compactChanged).includes(
          `adtcore:description="${compactDescription}"`,
        ),
        true,
      );

      await must(`HandlerValidate INCLUDE ${FREE_NAME}`, () =>
        handleHandlerValidate(context, {
          object_type: 'INCLUDE',
          object_name: FREE_NAME,
          package_name: PACKAGE,
          description,
        }),
      );
      await must(`HandlerDeletionCheck INCLUDE ${INCLUDE}`, () =>
        handleHandlerDeletionCheck(context, {
          object_type: 'INCLUDE',
          object_name: INCLUDE,
        }),
      );
      await must(`HandlerActivate INCLUDE ${INCLUDE}`, () =>
        handleHandlerActivate(context, {
          object_type: 'INCLUDE',
          object_name: INCLUDE,
        }),
      );
      const activeAgain = await must(
        `GetInclude ${INCLUDE} source (after HandlerActivate)`,
        () => handleGetInclude(context, { include_name: INCLUDE }),
      );
      assert.equal(
        normalisedSource(activeAgain.text),
        normalisedSource(compactSource),
      );

      // DeleteInclude, then a create of the same name right after: SAP's
      // answer recorded as sent.
      await must(`DeleteInclude ${INCLUDE}`, () =>
        handleDeleteInclude(context, { include_name: INCLUDE }),
      );
      forget(INCLUDE);
      const recreated = answerOf(
        await handleCreateInclude(context, {
          include_name: INCLUDE,
          package_name: PACKAGE,
          description,
        }),
      );
      record(
        `CreateInclude ${INCLUDE} again, right after the delete`,
        recreated,
      );
      if (!recreated.isError) {
        created.push({ kind: 'include', name: INCLUDE });
        await must(`DeleteInclude ${INCLUDE} (the re-created one)`, () =>
          handleDeleteInclude(context, { include_name: INCLUDE }),
        );
        forget(INCLUDE);
        const gone = await must(`SearchObject ${INCLUDE}`, () =>
          handleSearchObject(context, { object_name: INCLUDE }),
        );
        assert.equal(gone.text.includes(INCLUDE), false);
      }

      // A second include through the compact create and delete.
      await must(`HandlerCreate INCLUDE ${COMPACT_INCLUDE}`, () =>
        handleHandlerCreate(context, {
          object_type: 'INCLUDE',
          include_name: COMPACT_INCLUDE,
          package_name: PACKAGE,
          description,
        }),
      );
      created.push({ kind: 'include', name: COMPACT_INCLUDE });
      await must(`HandlerDelete INCLUDE ${COMPACT_INCLUDE}`, () =>
        handleHandlerDelete(context, {
          object_type: 'INCLUDE',
          include_name: COMPACT_INCLUDE,
        }),
      );
      forget(COMPACT_INCLUDE);
    });
  });
});

/** The tools a server instance lists through the MCP protocol (`tools/list`). */
async function listedTools(
  server: EmbeddableMcpServer,
): Promise<Array<{ name: string; inputSchema: unknown }>> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  // Timer-free JSON-RPC over the in-memory transport (no SDK client).
  const client = new McpSession(clientSide);
  await Promise.all([server.connect(serverSide), client.initialize()]);
  try {
    const tools = await client.listTools();
    return tools.map((tool) => ({
      name: tool.name,
      inputSchema: tool.inputSchema,
    }));
  } finally {
    await client.close();
  }
}

/** The `object_type` enum a listed compact tool declares. */
function objectTypesOf(
  tools: ReadonlyArray<{ name: string; inputSchema: unknown }>,
  name: string,
): unknown {
  const tool = tools.find((entry) => entry.name === name);
  return field(
    field(field(tool?.inputSchema, 'properties'), 'object_type'),
    'enum',
  );
}

/**
 * **Where it runs: ABAP cloud only** (`include_cloud_read`,
 * `available_in: ["cloud"]`). On cloud the include is read-only: the server
 * lists no include write, `HandlerCreate` offers no `INCLUDE`, and the reads
 * (`GetInclude` both parts, `HandlerGet INCLUDE`, `HandlerDeletionCheck
 * INCLUDE`) run on the delivered include the configuration names
 * (`include_name`). An empty `include_name` skips the reads and says so;
 * elsewhere the case skips (LambdaTester: "not available on onprem",
 * "No configuration found"). Nothing is written.
 */
describe('Include on ABAP cloud: listed read-only, read', () => {
  let tester: LambdaTester;
  let handlerContext: HandlerContext | undefined;
  const record = (label: string, answer: Answer) =>
    logger?.info(
      `[answer] ${label}: ${answer.isError ? 'isError ' : ''}${answer.text}`,
    );

  before(async () => {
    tester = new LambdaTester(
      'include_cloud_read',
      'read_delivered_include',
      'incl-cloud',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        if (context.hasConfig) {
          handlerContext = createHandlerContext({
            connection: context.connection,
            logger: context.logger,
          });
        }
      },
      // Nothing is written, so nothing is deleted.
      async () => {},
    );
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  after(async () => {
    await tester.afterAll(async () => {});
  });

  it('lists no include write, and HandlerCreate offers no INCLUDE', async () => {
    await tester.run(async (ctx: LambdaTesterContext) => {
      assert.equal(getSystemType(), 'cloud');
      // The core set (readonly + high, low included), as cloud lists it.
      const core = await listedTools(
        new EmbeddableMcpServer({
          connection: ctx.connection,
          exposition: ['readonly', 'high'],
          systemType: 'cloud',
        }),
      );
      const coreNames = core.map((tool) => tool.name);
      logger?.info(
        `[answer] tools/list core (cloud): ${coreNames.length} tools; include tools: ${coreNames.filter((name) => name.includes('Include')).join(', ')}`,
      );
      for (const write of [
        'CreateInclude',
        'UpdateInclude',
        'UpdateIncludeMetadata',
        'DeleteInclude',
        'ActivateIncludeLow',
      ]) {
        assert.ok(!coreNames.includes(write));
      }
      assert.ok(coreNames.includes('GetInclude'));

      // The compact set, as cloud lists it.
      const compactContext = createHandlerContext({
        connection: ctx.connection,
        logger: ctx.logger,
      });
      const compact = await listedTools(
        new EmbeddableMcpServer({
          connection: ctx.connection,
          systemType: 'cloud',
          handlersRegistry: new CompositeHandlersRegistry([
            new CompactHandlersGroup(compactContext, [
              compactReadOnlyEntries,
              compactModifyEntries,
            ]),
          ]),
        }),
      );
      const enumOf = (name: string): unknown[] => {
        const members = objectTypesOf(compact, name);
        // Read from the listed schema, data from outside the type system.
        assert.ok(Array.isArray(members), name);
        logger?.info(
          `[answer] tools/list ${name} object_type (cloud): ${JSON.stringify(members)}`,
        );
        return members;
      };
      assert.ok(!enumOf('HandlerCreate').includes('INCLUDE'));
      assert.ok(!enumOf('HandlerUpdate').includes('INCLUDE'));
      assert.ok(!enumOf('HandlerDelete').includes('INCLUDE'));
      assert.ok(enumOf('HandlerGet').includes('INCLUDE'));
      assert.ok(enumOf('HandlerDeletionCheck').includes('INCLUDE'));
    });
  });

  it('reads a delivered include: GetInclude both parts, HandlerGet, HandlerDeletionCheck', async () => {
    await tester.run(async (ctx: LambdaTesterContext) => {
      const context = handlerContext;
      if (context === undefined) throw new Error('No handler context');
      const includeName: string = ctx.params.include_name ?? '';
      if (includeName === '') {
        throw new Error(
          'SKIP: include_cloud_read.include_name is empty: the configuration names no delivered include to read',
        );
      }
      const must = async (label: string, call: () => Promise<unknown>) => {
        const answer = answerOf(await call());
        record(label, answer);
        if (answer.isError) {
          throw new Error(`${label} was refused: ${answer.text}`);
        }
        return answer;
      };
      const source = await must(`GetInclude ${includeName} source`, () =>
        handleGetInclude(context, { include_name: includeName }),
      );
      assert.notEqual(source.text, '');
      const metadata = await must(`GetInclude ${includeName} metadata`, () =>
        handleGetInclude(context, {
          include_name: includeName,
          part: 'metadata',
        }),
      );
      assert.equal(typeof field(parsed(metadata.text), 'metadata'), 'string');
      await must(`HandlerGet INCLUDE ${includeName}`, () =>
        handleHandlerGet(context, {
          object_type: 'INCLUDE',
          include_name: includeName,
        }),
      );
      await must(`HandlerGet INCLUDE ${includeName} metadata`, () =>
        handleHandlerGet(context, {
          object_type: 'INCLUDE',
          include_name: includeName,
          part: 'metadata',
        }),
      );
      // SAP's verdict on a delivered include, recorded as answered.
      record(
        `HandlerDeletionCheck INCLUDE ${includeName}`,
        answerOf(
          await handleHandlerDeletionCheck(context, {
            object_type: 'INCLUDE',
            object_name: includeName,
          }),
        ),
      );
    });
  });
});
