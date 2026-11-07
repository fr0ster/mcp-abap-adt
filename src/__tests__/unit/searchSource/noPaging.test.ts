/**
 * `SearchSource` reads every target in one run (DO20): no `max_objects`, no
 * `start_at`, no cursor in the answer; `max_hits_per_object` limits each
 * object only when given. Each case runs on both paths — ADT batch envelopes
 * (`served`) and the sequential reads (`absent`) — with the real handler and
 * real clients over the stand's fake connection.
 */
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import {
  isError,
  nodeKey,
  payloadOf,
  type Repository,
  searchOn,
  standOn,
} from '../../helpers/searchSourceStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const PATHS = [['served'], ['absent']] as const;

/** `ZBIG` holds `count` programs, each with one hit. */
function big(count: number): Repository {
  const programs = Array.from(
    { length: count },
    (_, i) => `ZP${String(i + 1).padStart(4, '0')}`,
  );
  return {
    nodes: {
      [nodeKey('ZBIG')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
      [nodeKey('ZBIG', '1')]: {
        objects: programs.map((name) => ({ type: 'PROG/P', name })),
      },
    },
    sources: Object.fromEntries(
      programs.map((name) => [`PROGRAM ${name}`, "WRITE 'marker'."]),
    ),
    fugrChildren: {},
    masks: {},
  };
}

/** `ZHITS` holds `ZMANY` (150 hits) and `ZFEW` (2 hits). */
const HITS: Repository = {
  nodes: {
    [nodeKey('ZHITS')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZHITS', '1')]: {
      objects: [
        { type: 'PROG/P', name: 'ZMANY' },
        { type: 'PROG/P', name: 'ZFEW' },
      ],
    },
  },
  sources: {
    'PROGRAM ZMANY': Array.from({ length: 150 }, () => 'marker').join('\n'),
    'PROGRAM ZFEW': 'marker\nmarker',
  },
  fugrChildren: {},
  masks: {},
};

const count = (payload: { results: Array<{ object_name: string }> }) => {
  const out: Record<string, number> = {};
  for (const h of payload.results) {
    out[h.object_name] = (out[h.object_name] ?? 0) + 1;
  }
  return out;
};

describe('SearchSource: no paging (DO20)', () => {
  it('SearchSource does not declare max_objects or start_at; no field names a package or object limit', () => {
    const keys = Object.keys(TOOL_DEFINITION.inputSchema.shape);
    expect(keys).not.toContain('max_objects');
    expect(keys).not.toContain('start_at');
    expect(keys).not.toContain('maxResults');
    expect(keys.filter((k) => k.startsWith('max_'))).toEqual([
      'max_hits_per_object',
    ]);
  });

  it.each(PATHS)(
    'every target is read in one call; the answer has no cursor fields (%s)',
    async (batch) => {
      const result = await searchOn(
        standOn(big(520)),
        { query: 'marker', packages: ['ZBIG'] },
        batch === 'absent',
        4000,
      );
      expect(isError(result)).toBe(false);
      const payload = payloadOf(result);
      expect(payload.results).toHaveLength(520);
      expect(payload.scanned.objects).toBe(520);
      expect(payload.total_targets).toBeUndefined();
      expect(payload.next_start_at).toBeUndefined();
      expect(payload.truncated).toEqual({ by_object_cap: false });
    },
  );

  it.each(PATHS)(
    'a call that still sends max_objects or start_at has them dropped (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const plain = payloadOf(
        await searchOn(
          standOn(big(5)),
          { query: 'marker', packages: ['ZBIG'] },
          absent,
        ),
      );
      const sent = await searchOn(
        standOn(big(5)),
        { query: 'marker', packages: ['ZBIG'], max_objects: 2, start_at: 3 },
        absent,
      );
      expect(isError(sent)).toBe(false);
      expect(payloadOf(sent)).toEqual(plain);
      expect(plain.results).toHaveLength(5);
    },
  );

  it.each(PATHS)(
    'max_hits_per_object absent means no limit (%s)',
    async (batch) => {
      const payload = payloadOf(
        await searchOn(
          standOn(HITS),
          { query: 'marker', packages: ['ZHITS'] },
          batch === 'absent',
        ),
      );
      expect(count(payload)).toEqual({ ZMANY: 150, ZFEW: 2 });
      expect(payload.truncated.by_object_cap).toBe(false);
    },
  );

  it.each(PATHS)(
    'max_hits_per_object given limits each object; the flag is set by the object that passed it (%s)',
    async (batch) => {
      const payload = payloadOf(
        await searchOn(
          standOn(HITS),
          { query: 'marker', packages: ['ZHITS'], max_hits_per_object: 3 },
          batch === 'absent',
        ),
      );
      expect(count(payload)).toEqual({ ZMANY: 3, ZFEW: 2 });
      expect(payload.truncated.by_object_cap).toBe(true);
    },
  );
});
