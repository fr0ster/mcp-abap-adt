/**
 * `HandlerSystem` (D25, DO21): one compact tool, eight actions, each the
 * call of exactly one full tool's entry, picked by `action` alone.
 *
 * Each case runs real adt-clients code over a recording connection declared
 * the variant (no SAP): a `HandlerSystem` call sends, literal for literal,
 * what its full tool sends for the same arguments, and answers what it
 * answers. The routing itself is pinned with recording doubles of the
 * targets (`systemCall`): the target of the action sees the call, no other.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  SYSTEM_ACTIONS,
  type SystemAction,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  defineTool,
  type HandlerContext,
  invalidArgumentsWords,
  type ToolArgs,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetATCFindings,
  handleGetATCResult,
  handleGetPackageTree,
  handleGetWhereUsed,
  handleListATCResults,
  handleListTransports,
  handleSearchObject,
  handleSearchSource,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { setSystemContext } from '../../../src/__tests__/helpers/processSystemContext';
import {
  type RecordedRequest,
  recordingConnection,
} from '../../../src/__tests__/helpers/recordingConnection';
import type { ProjectionVariant } from '../../../src/lib/adtProjections';
import { resetSystemContextCache } from '../../../src/lib/systemContext';
import { declareSystemKind } from '../../../src/lib/systemKind';
import {
  handleHandlerSystem,
  type SystemTarget,
  systemCall,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerSystem';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

const D = READ_DEFINITIONS;

/** Each action's full tool, by its own entry: what a HandlerSystem call must equal. */
const FULL: Readonly<
  Record<SystemAction, { readonly tool: string; readonly call: SystemTarget }>
> = {
  search_source: {
    tool: 'SearchSource',
    call: defineTool(D.SearchSource, handleSearchSource).call,
  },
  search_object: {
    tool: 'SearchObject',
    call: defineTool(D.SearchObject, handleSearchObject).call,
  },
  where_used: {
    tool: 'GetWhereUsed',
    call: defineTool(D.GetWhereUsed, handleGetWhereUsed).call,
  },
  package_tree: {
    tool: 'GetPackageTree',
    call: defineTool(D.GetPackageTree, handleGetPackageTree).call,
  },
  transports: {
    tool: 'ListTransports',
    call: defineTool(D.ListTransports, handleListTransports).call,
  },
  atc_findings: {
    tool: 'GetATCFindings',
    call: defineTool(D.GetATCFindings, handleGetATCFindings).call,
  },
  atc_results: {
    tool: 'ListATCResults',
    call: defineTool(D.ListATCResults, handleListATCResults).call,
  },
  atc_result: {
    tool: 'GetATCResult',
    call: defineTool(D.GetATCResult, handleGetATCResult).call,
  },
};

/** Each action's arguments: valid, enough for its first request. Placeholder names only. */
const ARGS: Readonly<Record<SystemAction, ToolArgs>> = {
  search_source: { query: 'placeholder', packages: ['ZPKG_A'] },
  search_object: { object_name: 'ZCL_A*' },
  where_used: { object_name: 'ZCL_A', object_type: 'class' },
  package_tree: { package_name: 'ZPKG_A' },
  transports: { user: 'USER_A' },
  atc_findings: { worklist_id: 'WORKLIST_A' },
  atc_results: { created_by: '*' },
  atc_result: { display_id: 'RESULT_A' },
};

/** A well-typed argument only another action takes, per action. */
const FOREIGN: Readonly<Record<SystemAction, ToolArgs>> = {
  search_source: { display_id: 'RESULT_A' },
  search_object: { worklist_id: 'WORKLIST_A' },
  where_used: { display_id: 'RESULT_A' },
  package_tree: { created_by: '*' },
  transports: { query: 'placeholder' },
  atc_findings: { package_name: 'ZPKG_A' },
  atc_results: { worklist_id: 'WORKLIST_A' },
  atc_result: { packages: ['Z*'] },
};

/** A wrong-typed argument only another action takes, per action. */
const FOREIGN_WRONG: Readonly<Record<SystemAction, ToolArgs>> = {
  search_source: { display_id: 1 },
  search_object: { worklist_id: 123 },
  where_used: { display_id: 1 },
  package_tree: { created_by: false },
  transports: { query: 7 },
  atc_findings: { package_name: 5 },
  atc_results: { worklist_id: 9 },
  atc_result: { packages: 'Z*' },
};

/** A wrong-typed or ill-valued argument of the action itself, per action. */
const MALFORMED: Readonly<Record<SystemAction, ToolArgs>> = {
  search_source: { query: '', packages: ['ZPKG_A'] },
  search_object: { object_name: 'Z*', maxResults: 'x' },
  where_used: { object_name: 'ZCL_A', object_type: 'class', objects: 'x' },
  package_tree: { package_name: 'ZPKG_A', include_subpackages: 'yes' },
  transports: { modifiable_only: 'true' },
  atc_findings: { worklist_id: 7 },
  atc_results: { created_by: '*', age_min: '1' },
  atc_result: { display_id: 'RESULT_A', detail: 'everything' },
};

/** What a call answered, thrown or returned, as text. */
async function answerOf(work: Promise<unknown>): Promise<string> {
  const answered = await work.then(
    (value) => value,
    (thrown: unknown) => ({
      thrown: thrown instanceof Error ? thrown.message : String(thrown),
    }),
  );
  return JSON.stringify(answered);
}

/** The length of the random part of an ADT batch envelope's boundary (a UUID). */
const BOUNDARY_ID = 36;

/** `text` with every envelope boundary's random part as `<boundary>`, read by plain string search. */
function boundaryFree(text: string): string {
  const parts = text.split('batch_');
  return parts
    .map((part, i) => (i === 0 ? part : `<boundary>${part.slice(BOUNDARY_ID)}`))
    .join('batch_');
}

/** The requests and the answer of one call on a fresh recording connection. */
async function run(
  variant: ProjectionVariant,
  send: (context: HandlerContext) => Promise<unknown>,
): Promise<{ requests: string; answered: string; sent: number }> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const answered = await answerOf(send({ connection, logger: undefined }));
  const requests: readonly RecordedRequest[] = connection.requests;
  return {
    requests: boundaryFree(JSON.stringify(requests)),
    answered: boundaryFree(answered),
    sent: requests.length,
  };
}

const entry = defineTool(TOOL_DEFINITION, handleHandlerSystem);

/** A HandlerSystem call of `action` with `args`, through its entry. */
const systemOf =
  (action: string, args: ToolArgs) => (context: HandlerContext) =>
    entry.call(context, { action, ...args });

/** Recording doubles of the eight targets: each records the call it sees. */
function recordingTargets() {
  const seen: Array<{ action: SystemAction; args: ToolArgs }> = [];
  const double =
    (action: SystemAction): SystemTarget =>
    async (_context, args) => {
      seen.push({ action, args });
      return { isError: false, content: [{ type: 'text', text: action }] };
    };
  const targets: Record<SystemAction, SystemTarget> = {
    search_source: double('search_source'),
    search_object: double('search_object'),
    where_used: double('where_used'),
    package_tree: double('package_tree'),
    transports: double('transports'),
    atc_findings: double('atc_findings'),
    atc_results: double('atc_results'),
    atc_result: double('atc_result'),
  };
  return { seen, targets };
}

const context: HandlerContext = {
  connection: recordingConnection(),
  logger: undefined,
};

describe('HandlerSystem', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });

  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  const perVariant = VARIANTS.flatMap((variant) =>
    SYSTEM_ACTIONS.map((action) => [action, variant] as const),
  );

  it('offers exactly the eight actions, each one full tool', () => {
    assert.deepStrictEqual(SYSTEM_ACTIONS, [
      'search_source',
      'search_object',
      'where_used',
      'package_tree',
      'transports',
      'atc_findings',
      'atc_results',
      'atc_result',
    ]);
    assert.deepStrictEqual(
      Object.values(FULL).map((full) => full.tool),
      [
        'SearchSource',
        'SearchObject',
        'GetWhereUsed',
        'GetPackageTree',
        'ListTransports',
        'GetATCFindings',
        'ListATCResults',
        'GetATCResult',
      ],
    );
  });

  for (const [action, variant] of perVariant) {
    it(
      format(
        "each action calls exactly its full tool's path: %s on %s",
        action,
        variant,
      ),
      async () => {
        const full = await run(variant, (c) =>
          FULL[action].call(c, ARGS[action]),
        );
        const system = await run(variant, systemOf(action, ARGS[action]));
        assert.ok(full.sent > 0);
        assert.deepStrictEqual(system, full);
      },
    );
  }

  for (const [action, variant] of perVariant) {
    it(
      format(
        'background is HandlerSystem’s own: %s on %s with background false sends what the full tool sends',
        action,
        variant,
      ),
      async () => {
        const full = await run(variant, (c) =>
          FULL[action].call(c, ARGS[action]),
        );
        const system = await run(
          variant,
          systemOf(action, { ...ARGS[action], background: false }),
        );
        assert.deepStrictEqual(system, full);
      },
    );
  }

  for (const action of SYSTEM_ACTIONS) {
    it(
      format("each action goes through its target's entry: %s", action),
      async () => {
        const { seen, targets } = recordingTargets();
        const parsed = TOOL_DEFINITION.inputSchema.parse({
          action,
          background: false,
          ...ARGS[action],
        });
        await systemCall(targets, context, parsed);
        // The target gets the call's arguments without action and background.
        assert.deepStrictEqual(seen, [{ action, args: ARGS[action] }]);
      },
    );
  }

  describe('argument errors, nothing sent', () => {
    it('action is required', async () => {
      const { requests, answered } = await run('onprem', (c) =>
        entry.call(c, { object_name: 'Z*' }),
      );
      assert.ok(
        answered.includes(
          'Input validation error: Invalid arguments for tool HandlerSystem',
        ),
      );
      assert.ok(answered.includes('at action'));
      assert.equal(requests, '[]');
    });

    it('an action outside the eight is refused, naming the eight', async () => {
      const { requests, answered } = await run('onprem', (c) =>
        entry.call(c, { action: 'search', object_name: 'Z*' }),
      );
      const parsed = TOOL_DEFINITION.inputSchema.safeParse({
        action: 'search',
        object_name: 'Z*',
      });
      assert.equal(parsed.success, false);
      assert.deepStrictEqual(JSON.parse(answered), {
        thrown: invalidArgumentsWords(
          'HandlerSystem',
          parsed.error?.issues ?? [],
        ),
      });
      for (const action of SYSTEM_ACTIONS) assert.ok(answered.includes(action));
      assert.equal(requests, '[]');
    });

    /** Each argument its full tool requires, missing, and the target's words. */
    const MISSING: ReadonlyArray<
      readonly [SystemAction, string, ToolArgs, string]
    > = [
      [
        'search_source',
        'query',
        { packages: ['ZPKG_A'] },
        'HandlerSystem: SearchSource: Invalid input: expected string, received undefined at query',
      ],
      [
        'search_source',
        'packages',
        { query: 'placeholder' },
        'HandlerSystem: SearchSource: Invalid input: expected array, received undefined at packages',
      ],
      [
        'search_object',
        'object_name',
        {},
        'HandlerSystem: SearchObject: object_name is required at object_name',
      ],
      [
        'where_used',
        'object_name',
        { object_type: 'class' },
        'Object name is required',
      ],
      [
        'where_used',
        'object_type',
        { object_name: 'ZCL_A' },
        'Object type is required',
      ],
      ['package_tree', 'package_name', {}, 'package_name is required'],
      [
        'atc_findings',
        'worklist_id',
        {},
        'HandlerSystem: GetATCFindings: worklist_id is required. RunATC answers one on every run. at worklist_id',
      ],
      [
        'atc_results',
        'created_by',
        {},
        'HandlerSystem: ListATCResults: created_by is required: a user name, or * for every user. at created_by',
      ],
      [
        'atc_result',
        'display_id',
        {},
        'HandlerSystem: GetATCResult: display_id is required. ListATCResults answers one per result. at display_id',
      ],
    ];

    for (const [action, _argument, args, words] of MISSING) {
      it(
        format(
          "%s without %s: refused in the target's words",
          action,
          _argument,
        ),
        async () => {
          for (const variant of VARIANTS) {
            const { requests, answered } = await run(
              variant,
              systemOf(action, args),
            );
            assert.ok(answered.includes(words));
            assert.equal(requests, '[]');
          }
        },
      );
    }

    for (const action of SYSTEM_ACTIONS) {
      it(
        format(
          'a malformed argument of the action itself is refused before dispatch: %s',
          action,
        ),
        async () => {
          const { seen, targets } = recordingTargets();
          const args = { action, ...MALFORMED[action] };
          const parsed = TOOL_DEFINITION.inputSchema.safeParse(args);
          assert.equal(parsed.success, false);
          const { requests, answered } = await run('onprem', (c) =>
            entry.call(c, args),
          );
          assert.deepStrictEqual(JSON.parse(answered), {
            thrown: invalidArgumentsWords(
              'HandlerSystem',
              parsed.error?.issues ?? [],
            ),
          });
          assert.equal(requests, '[]');
          // The handler never ran: no target saw a call.
          assert.deepStrictEqual(seen, []);
          assert.notEqual(targets, undefined);
        },
      );
    }

    for (const action of SYSTEM_ACTIONS) {
      it(
        format(
          'a wrong-typed argument of another action is refused before dispatch: %s',
          action,
        ),
        async () => {
          const args = { action, ...ARGS[action], ...FOREIGN_WRONG[action] };
          const parsed = TOOL_DEFINITION.inputSchema.safeParse(args);
          assert.equal(parsed.success, false);
          const { requests, answered } = await run('onprem', (c) =>
            entry.call(c, args),
          );
          assert.deepStrictEqual(JSON.parse(answered), {
            thrown: invalidArgumentsWords(
              'HandlerSystem',
              parsed.error?.issues ?? [],
            ),
          });
          assert.equal(requests, '[]');
        },
      );
    }
  });

  for (const [action, variant] of perVariant) {
    it(
      format(
        'a well-typed argument of another action is dropped: %s on %s',
        action,
        variant,
      ),
      async () => {
        const plain = await run(variant, systemOf(action, ARGS[action]));
        const foreign = await run(
          variant,
          systemOf(action, { ...ARGS[action], ...FOREIGN[action] }),
        );
        assert.deepStrictEqual(foreign, plain);
      },
    );
  }

  for (const [action, variant] of perVariant) {
    it(
      format('a key no action declares is dropped: %s on %s', action, variant),
      async () => {
        const plain = await run(variant, systemOf(action, ARGS[action]));
        const undeclared = await run(
          variant,
          systemOf(action, { ...ARGS[action], made_up_key: 'x' }),
        );
        assert.deepStrictEqual(undeclared, plain);
      },
    );
  }

  const DETAIL_TAKERS: readonly SystemAction[] = [
    'search_source',
    'search_object',
    'where_used',
    'package_tree',
    'transports',
    'atc_findings',
    'atc_results',
    'atc_result',
  ];

  for (const [action, detail] of DETAIL_TAKERS.flatMap((action) =>
    (['terse', 'medium', 'full', 'raw'] as const).map(
      (detail) => [action, detail] as const,
    ),
  )) {
    it(
      format(
        "detail is each detail-taking action's own: %s with %s answers as the full tool",
        action,
        detail,
      ),
      async () => {
        const args = { ...ARGS[action], detail };
        const full = await run('onprem', (c) => FULL[action].call(c, args));
        const system = await run('onprem', systemOf(action, args));
        assert.deepStrictEqual(system, full);
      },
    );
  }

  for (const action of SYSTEM_ACTIONS.filter(
    (action) => !DETAIL_TAKERS.includes(action),
  )) {
    it(format('the other actions drop detail: %s', action), async () => {
      const plain = await run('onprem', systemOf(action, ARGS[action]));
      const detailed = await run(
        'onprem',
        systemOf(action, { ...ARGS[action], detail: 'full' }),
      );
      assert.deepStrictEqual(detailed, plain);
    });
  }

  describe('the action alone picks the tool', () => {
    it('atc_results with a worklist_id still lists the ATC results', async () => {
      const full = await run('onprem', (c) =>
        FULL.atc_results.call(c, ARGS.atc_results),
      );
      const system = await run(
        'onprem',
        systemOf('atc_results', {
          ...ARGS.atc_results,
          worklist_id: 'WORKLIST_A',
        }),
      );
      assert.deepStrictEqual(system, full);
    });

    it('atc_findings with a display_id and no worklist_id is refused for the worklist_id', async () => {
      const { requests, answered } = await run(
        'onprem',
        systemOf('atc_findings', { display_id: 'RESULT_A' }),
      );
      assert.ok(
        answered.includes(
          'HandlerSystem: GetATCFindings: worklist_id is required. RunATC answers one on every run. at worklist_id',
        ),
      );
      assert.equal(requests, '[]');
    });
  });
});
