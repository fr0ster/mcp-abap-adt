/**
 * A tool can be a COPY in two groups: same name, schema and handler in
 * readonly and in high (GetUnitTestResult — purely a read). The rule: a caller
 * granted readonly alone gets it from readonly; a caller granted both gets it
 * ONCE, from high.
 *
 * `ReadOnlyHandlersGroup.getHandlers()` enforces it, whatever dedup strategy is
 * injected: a strategy decides about differently named pairs (Read<X> vs
 * Get<X>), and two tools under one name cannot both be registered anyway.
 *
 * Run: npm test -- --testPathPatterns=unit/readonlyHighSameNameDedup
 */

import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../lib/handlers/groups/ReadOnlyHandlersGroup';
import {
  NoDedupStrategy,
  ReadVsGetDedupStrategy,
} from '../../lib/handlers/groups/strategies/index';
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
  const ro = jest
    .spyOn(ReadOnlyHandlersGroup.prototype, 'getHandlers')
    .mockImplementation(record('readonly', roOriginal));
  const hi = jest
    .spyOn(HighLevelHandlersGroup.prototype, 'getHandlers')
    .mockImplementation(record('high', hiOriginal));
  return {
    contributors,
    restore: () => {
      ro.mockRestore();
      hi.mockRestore();
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
    expect(ro).toBeDefined();
    expect(hi).toBeDefined();
    expect(ro?.toolDefinition).toBe(hi?.toolDefinition);
  });

  describe('ReadOnlyHandlersGroup', () => {
    it('readonly alone: keeps the tool', () => {
      expect(names(new ReadOnlyHandlersGroup(ctx).getHandlers())).toContain(
        TOOL,
      );
    });

    it.each([
      ['ReadVsGetDedupStrategy', new ReadVsGetDedupStrategy()],
      ['NoDedupStrategy', new NoDedupStrategy()],
    ])('with high exposed (%s): withholds it, so high supplies it', (_n, s) => {
      const group = new ReadOnlyHandlersGroup(ctx, highNames(), s);
      expect(names(group.getHandlers())).not.toContain(TOOL);
    });
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
        expect(
          registeredToolNames(server).filter((n) => n === TOOL),
        ).toHaveLength(1);
        expect([...new Set(spy.contributors)]).toEqual(['readonly']);
      } finally {
        spy.restore();
      }
    });

    it.each([
      ['default strategy', undefined],
      ['NoDedupStrategy', new NoDedupStrategy()],
    ])('readonly+high (%s): registered once, from high', (_n, strategy) => {
      const spy = spyOnContributors();
      try {
        const server = new EmbeddableMcpServer({
          connection: {} as never,
          exposition: ['readonly', 'high'],
          systemType: 'onprem',
          readOnlyDedupStrategy: strategy,
        });
        expect(
          registeredToolNames(server).filter((n) => n === TOOL),
        ).toHaveLength(1);
        // Only high handed it over; readonly's answer did not carry it.
        expect([...new Set(spy.contributors)]).toEqual(['high']);
      } finally {
        spy.restore();
      }
    });
  });

  describe('HandlerExporter', () => {
    it('readonly only: one entry', () => {
      const exporter = new HandlerExporter({
        includeHighLevel: false,
        includeLowLevel: false,
      });
      expect(exporter.getToolNames().filter((n) => n === TOOL)).toHaveLength(1);
    });

    it('readonly+high: one entry, from high; Read<X> beside Get<X> unchanged', () => {
      const spy = spyOnContributors();
      try {
        const exporter = new HandlerExporter({
          includeLowLevel: false,
          systemContextResolver: null,
        });
        const all = exporter.getToolNames();
        expect(all.filter((n) => n === TOOL)).toHaveLength(1);
        expect(new Set(all).size).toBe(all.length);
        // The exporter never hid Read<X> for Get<X>, and still does not.
        expect(all).toContain('ReadClass');
        expect(all).toContain('GetClass');
        spy.contributors.length = 0;
        exporter.getHandlerEntries();
        expect([...new Set(spy.contributors)]).toEqual(['high']);
      } finally {
        spy.restore();
      }
    });
  });
});
