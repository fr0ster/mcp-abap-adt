/**
 * A tool can be a COPY in two groups: same name, schema and handler in
 * readonly and in high (GetUnitTestResult, the object reads Get<Type> —
 * purely reads). The rule: a caller
 * granted readonly alone gets it from readonly; a caller granted both gets it
 * ONCE, from high.
 *
 * `ReadOnlyHandlersGroup.getHandlers()` enforces it, whatever dedup strategy is
 * injected: a strategy decides about differently named tools, and two tools
 * under one name cannot both be registered anyway.
 *
 * Run: npm test -- --testPathPatterns=unit/readonlyHighSameNameDedup
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { NoDedupStrategy } from '../../lib/handlers/groups/strategies/index';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type { HandlerEntry } from '../../lib/handlers/interfaces';

const TOOL = 'GetUnitTestResult';
const ctx = { connection: null, logger: undefined } as never;

const names = (entries: HandlerEntry[]) =>
  entries.map((e) => e.toolDefinition.name);

const highNames = () =>
  new Set(names(new HighLevelHandlersGroup(ctx).getHandlers()));

function registeredToolNames(server: EmbeddableMcpServer): string[] {
  return Object.keys(
    (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools ?? {},
  );
}

/** Which group handed TOOL to the server: records every getHandlers() answer. */
function spyOnContributors() {
  const contributors: string[] = [];
  // Captured before spyOn swaps the prototype methods.
  const roOriginal = ReadOnlyHandlersGroup.prototype.getHandlers;
  const hiOriginal = HighLevelHandlersGroup.prototype.getHandlers;
  const record = (label: string, original: () => HandlerEntry[]) =>
    function (this: unknown) {
      const entries = original.call(this);
      if (names(entries).includes(TOOL)) contributors.push(label);
      return entries;
    };
  const ro = mock.method(
    ReadOnlyHandlersGroup.prototype,
    'getHandlers',
    record('readonly', roOriginal),
  );
  const hi = mock.method(
    HighLevelHandlersGroup.prototype,
    'getHandlers',
    record('high', hiOriginal),
  );
  return {
    contributors,
    restore: () => {
      ro.mock.restore();
      hi.mock.restore();
    },
  };
}

describe('the same tool in readonly and high', () => {
  it('is a copy: one definition, present in both groups', () => {
    const ro = new ReadOnlyHandlersGroup(ctx)
      .getHandlers()
      .find((e) => e.toolDefinition.name === TOOL);
    const hi = new HighLevelHandlersGroup(ctx)
      .getHandlers()
      .find((e) => e.toolDefinition.name === TOOL);
    assert.notEqual(ro, undefined);
    assert.notEqual(hi, undefined);
    assert.equal(ro?.toolDefinition, hi?.toolDefinition);
  });

  describe('ReadOnlyHandlersGroup', () => {
    it('readonly alone: keeps the tool', () => {
      assert.ok(
        names(new ReadOnlyHandlersGroup(ctx).getHandlers()).includes(TOOL),
      );
    });

    for (const [_n, s] of [
      ['no strategy', undefined],
      ['NoDedupStrategy', new NoDedupStrategy()],
    ] satisfies [string, NoDedupStrategy | undefined][]) {
      it(
        format('with high exposed (%s): withholds it, so high supplies it', _n),
        () => {
          const group = new ReadOnlyHandlersGroup(ctx, highNames(), s);
          assert.ok(!names(group.getHandlers()).includes(TOOL));
        },
      );
    }
  });

  describe('EmbeddableMcpServer', () => {
    it('readonly only: registered once, from readonly', () => {
      const spy = spyOnContributors();
      try {
        const server = new EmbeddableMcpServer({
          connection: {} as never,
          exposition: ['readonly'],
          systemType: 'onprem',
        });
        assert.equal(
          registeredToolNames(server).filter((n) => n === TOOL).length,
          1,
        );
        assert.deepStrictEqual([...new Set(spy.contributors)], ['readonly']);
      } finally {
        spy.restore();
      }
    });

    for (const [_n, strategy] of [
      ['default strategy', undefined],
      ['NoDedupStrategy', new NoDedupStrategy()],
    ] satisfies [string, NoDedupStrategy | undefined][]) {
      it(format('readonly+high (%s): registered once, from high', _n), () => {
        const spy = spyOnContributors();
        try {
          const server = new EmbeddableMcpServer({
            connection: {} as never,
            exposition: ['readonly', 'high'],
            systemType: 'onprem',
            ...(strategy !== undefined && { readOnlyDedupStrategy: strategy }),
          });
          assert.equal(
            registeredToolNames(server).filter((n) => n === TOOL).length,
            1,
          );
          // Only high handed it over; readonly's answer did not carry it.
          assert.deepStrictEqual([...new Set(spy.contributors)], ['high']);
        } finally {
          spy.restore();
        }
      });
    }
  });

  describe('HandlerExporter', () => {
    it('readonly only: one entry', () => {
      const exporter = new HandlerExporter({
        systemType: 'onprem',
        includeHighLevel: false,
      });
      assert.equal(exporter.getToolNames().filter((n) => n === TOOL).length, 1);
    });

    it('readonly+high: one entry, from high; one GetClass, no ReadClass', () => {
      const spy = spyOnContributors();
      try {
        const exporter = new HandlerExporter({
          systemType: 'onprem',
          systemContextResolver: null,
        });
        const all = exporter.getToolNames();
        assert.equal(all.filter((n) => n === TOOL).length, 1);
        assert.equal(new Set(all).size, all.length);
        assert.equal(all.filter((n) => n === 'GetClass').length, 1);
        assert.ok(!all.includes('ReadClass'));
        spy.contributors.length = 0;
        exporter.getHandlerEntries();
        assert.deepStrictEqual([...new Set(spy.contributors)], ['high']);
      } finally {
        spy.restore();
      }
    });
  });
});
