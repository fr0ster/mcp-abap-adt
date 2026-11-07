/**
 * `SearchSource`'s two strategies — the SAP-answer one (DO22) and the line
 * match (DO24) — are the consumer's, passed only as explicit options, and
 * reach the handler on every route as the context's internal fields:
 * `EmbeddableMcpServer`'s options (a long call's own connection, a
 * background run), `HandlerExporter`'s options (`getHandlerEntries()`,
 * `registerOnServer`); on `createRegistry()` the hosting server's options;
 * the launchers pass the shipped ones; an optionless server leaves the
 * fields absent and the handler's default answers.
 *
 * Here the context the handler is called in is recorded on each route; the
 * handler's use of the fields is `sourcesAndFailures.test.ts`' (the D23b
 * routes block).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type LineMatchStrategy,
  type SapAnswerDecision,
  type SapAnswerStrategy,
  skipSapAnswers,
  substringLineMatch,
} from '../../../embeddable/index';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import type { CallContext } from '../../../lib/handlers/utils/handlerCall';
import {
  contextOn,
  hitNames,
  isError,
  nodeKey,
  payloadOf,
  type Repository,
  standOn,
} from '../../helpers/searchSourceStand';
import { longStand } from '../longTools/harness';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const sap: SapAnswerStrategy = { decide: () => 'end' };
const lines: LineMatchStrategy = {
  match: () => ({ hits: [], capped: false }),
};

/** A recorder of the contexts `SearchSource` is called in, and a promise of the first. */
function recorder() {
  const seen: HandlerContext[] = [];
  let first: (context: HandlerContext) => void = () => {};
  const called = new Promise<HandlerContext>((resolve) => {
    first = resolve;
  });
  return {
    seen,
    called,
    record: (context: HandlerContext) => {
      seen.push(context);
      first(context);
    },
  };
}

const ARGS = { query: 'placeholder', packages: ['PLACEHOLDER_PACKAGE'] };

describe('EmbeddableMcpServer: the options reach the handler on every route', () => {
  it("a long call's own connection (background: false)", async () => {
    const rec = recorder();
    const stand = await longStand('SearchSource', {
      sapAnswerStrategy: sap,
      lineMatchStrategy: lines,
      recordContext: rec.record,
    });
    try {
      await stand.call('SearchSource', ARGS);
      const context = await rec.called;
      expect(context.sapAnswerStrategy).toBe(sap);
      expect(context.lineMatchStrategy).toBe(lines);
    } finally {
      await stand.close();
    }
  });

  it("a background run's derived context (background, the default)", async () => {
    const rec = recorder();
    const stand = await longStand('SearchSource', {
      backgroundRuns: new InMemoryBackgroundRuns(),
      sapAnswerStrategy: sap,
      lineMatchStrategy: lines,
      recordContext: rec.record,
    });
    try {
      const started = await stand.call('SearchSource', ARGS);
      expect(started.isError).toBeFalsy();
      const context = await rec.called;
      expect(context.sapAnswerStrategy).toBe(sap);
      expect(context.lineMatchStrategy).toBe(lines);
    } finally {
      await stand.close();
    }
  });

  it('an optionless EmbeddableMcpServer leaves the fields absent', async () => {
    for (const backgroundRuns of [undefined, new InMemoryBackgroundRuns()]) {
      const rec = recorder();
      const stand = await longStand('SearchSource', {
        ...(backgroundRuns !== undefined ? { backgroundRuns } : {}),
        recordContext: rec.record,
      });
      try {
        await stand.call('SearchSource', ARGS);
        const context = await rec.called;
        expect('sapAnswerStrategy' in context).toBe(false);
        expect('lineMatchStrategy' in context).toBe(false);
      } finally {
        await stand.close();
      }
    }
  });
});

/** `ZONE` holds `ZOK` (a hit) and `ZBAD`, whose source SAP refuses with a 500. */
const ONE: Repository = {
  nodes: {
    [nodeKey('ZONE')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZONE', '1')]: {
      objects: [
        { type: 'PROG/P', name: 'ZOK' },
        { type: 'PROG/P', name: 'ZBAD' },
      ],
    },
  },
  sources: { 'PROGRAM ZOK': 'marker ok' },
  fugrChildren: {},
  masks: {},
};
const REFUSED = { refuse: { 'PROGRAM ZBAD': 500 } };
const SEARCH = { query: 'marker', packages: ['ZONE'], background: false };

/** A SAP-answer strategy recording each place it is asked for, answering `answer`. */
function recordingSap(answer: SapAnswerDecision) {
  const asked: string[] = [];
  const strategy: SapAnswerStrategy = {
    decide(_failure, place) {
      asked.push(place.kind);
      return answer;
    },
  };
  return { strategy, asked };
}

/** The exporter's `SearchSource` entry. */
function searchEntry(exporter: HandlerExporter) {
  const entry = exporter
    .getHandlerEntries()
    .find((e) => e.toolDefinition.name === 'SearchSource');
  if (entry === undefined) throw new Error('no SearchSource entry');
  return entry;
}

describe.each([
  ['served', false],
  ['absent', true],
] as const)('HandlerExporter (%s)', (_path, absent) => {
  it("getHandlerEntries(): the exporter's option is asked and obeyed, whatever the embedder's context held", async () => {
    const exporterSap = recordingSap('throw');
    const embedderSap = recordingSap('skip');
    const entry = searchEntry(
      new HandlerExporter({
        systemType: 'onprem',
        sapAnswerStrategy: exporterSap.strategy,
      }),
    );
    const context: HandlerContext = {
      ...contextOn(standOn(ONE, REFUSED), absent ? 'absent' : 'served'),
      sapAnswerStrategy: embedderSap.strategy,
    };
    const answer = await entry.call(context, SEARCH);
    expect(exporterSap.asked).toEqual(['source']);
    expect(embedderSap.asked).toEqual([]);
    expect(isError(answer)).toBe(true);
  });

  it('getHandlerEntries() without the option: the shipped strategy, whatever the embedder context held', async () => {
    const embedderSap = recordingSap('throw');
    const entry = searchEntry(new HandlerExporter({ systemType: 'onprem' }));
    const context: HandlerContext = {
      ...contextOn(standOn(ONE, REFUSED), absent ? 'absent' : 'served'),
      sapAnswerStrategy: embedderSap.strategy,
    };
    const answer = await entry.call(context, SEARCH);
    expect(embedderSap.asked).toEqual([]);
    expect(isError(answer)).toBe(false);
    expect(hitNames(answer)).toEqual(['ZOK/ZOK']);
  });

  it("getHandlerEntries(): the exporter's line match is the one used", async () => {
    const used: string[][] = [];
    const lineMatch: LineMatchStrategy = {
      match(sourceLines) {
        used.push([...sourceLines]);
        return { hits: [], capped: false };
      },
    };
    const entry = searchEntry(
      new HandlerExporter({
        systemType: 'onprem',
        lineMatchStrategy: lineMatch,
      }),
    );
    const answer = await entry.call(
      contextOn(standOn(ONE, REFUSED), absent ? 'absent' : 'served'),
      SEARCH,
    );
    expect(used).toEqual([['marker ok']]);
    expect(payloadOf(answer).results).toEqual([]);
  });

  it.each([
    ['with the options', true],
    ['without the options', false],
  ] as const)(
    "registerOnServer, %s: the context its calls run in carries the exporter's strategies",
    async (_name, given) => {
      const exporter = new HandlerExporter({
        systemType: 'onprem',
        ...(given ? { sapAnswerStrategy: sap, lineMatchStrategy: lines } : {}),
      });
      const fake = standOn(ONE, REFUSED);
      const connection = contextOn(
        fake,
        absent ? 'absent' : 'served',
      ).connection;
      const contexts: CallContext[] = [];
      const spy = jest
        .spyOn(CompositeHandlersRegistry.prototype, 'registerAllToolsOnCall')
        .mockImplementation((_server, callContext) => {
          contexts.push(callContext);
        });
      try {
        exporter.registerOnServer(
          new McpServer({ name: 'routes', version: '1.0.0' }),
          async () => connection,
        );
      } finally {
        spy.mockRestore();
      }
      const [callContext] = contexts;
      if (callContext === undefined) throw new Error('nothing registered');
      const context = await callContext();
      expect(context.connection).toBe(connection);
      if (given) {
        expect(context.sapAnswerStrategy).toBe(sap);
        expect(context.lineMatchStrategy).toBe(lines);
      } else {
        expect('sapAnswerStrategy' in context).toBe(false);
        expect('lineMatchStrategy' in context).toBe(false);
      }
    },
  );
});

describe('createRegistry() and the launchers', () => {
  it("createRegistry() takes no strategy of the exporter's: the hosting server's options apply", () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../lib/handlers/HandlerExporter.ts'),
      'utf8',
    );
    const at = source.indexOf('  createRegistry(): IHandlersRegistry {');
    const body = source.slice(at, source.indexOf('\n  }\n', at));
    expect(at).toBeGreaterThan(0);
    expect(body.includes('Strateg')).toBe(false);
  });

  it.each([
    ['stdio', 'server-runtime/src/stdio/launcher.ts'],
    ['http', 'server-runtime/src/http/launcher.ts'],
    ['sse', 'server-runtime/src/sse/launcher.ts'],
  ])('the %s launcher passes the shipped strategies', (_kind, file) => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../..', file),
      'utf8',
    );
    expect(source).toContain('sapAnswerStrategy: skipSapAnswers,');
    expect(source).toContain('lineMatchStrategy: substringLineMatch,');
  });

  it('the shipped strategies are the exported ones', () => {
    expect(
      skipSapAnswers.decide(new Error('x'), { kind: 'mask', mask: 'Z*' }),
    ).toBe('skip');
    expect(
      substringLineMatch.match(['a marker'], { query: 'marker' }).hits,
    ).toEqual([{ line: 1, snippet: 'a marker' }]);
  });
});
