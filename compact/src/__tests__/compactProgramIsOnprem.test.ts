import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import {
  jsonFind,
  listedJson,
} from '../../../src/__tests__/helpers/listedJson';

/**
 * ABAP Cloud has no program of one's own: nothing creates or changes one
 * there (the create is refused `403`, the transport `404`), but a delivered
 * program is read, checked and asked about (the cloud ADT table,
 * `ADT_TYPES_CLOUD`, measured). So a compact tool that creates or changes an
 * object may offer PROGRAM on cloud only by saying it is onprem only; a tool
 * that reads or checks one may offer it there.
 *
 * Read from each tool's cloud statement (`variants.cloud`: its description
 * and its `object_type` / `target_type` members), never from the source
 * text. Which tool writes is stated here, one entry per compact tool, and the
 * list must name every tool the two packages export (the opt-in data tool
 * included), so a new tool is
 * classified the day it is written.
 */
const WRITES = 'creates or changes an object';
const READS = 'reads or checks';

const KIND_OF: Readonly<Record<string, typeof WRITES | typeof READS>> = {
  HandlerActivate: WRITES,
  HandlerCreate: WRITES,
  HandlerDelete: WRITES,
  HandlerLock: WRITES,
  HandlerUpdate: WRITES,
  HandlerTransportCreate: WRITES,
  HandlerTransportMoveObjects: WRITES,
  HandlerTransportSortAndCompress: WRITES,
  HandlerProfileSchedule: WRITES,
  HandlerCdsUnitTestResult: READS,
  HandlerCdsUnitTestStatus: READS,
  HandlerCheckRun: READS,
  HandlerDeletionCheck: READS,
  HandlerDumpList: READS,
  HandlerDumpView: READS,
  HandlerGet: READS,
  HandlerGetData: READS,
  HandlerProfileList: READS,
  HandlerProfileRun: READS,
  HandlerProfileView: READS,
  HandlerServiceBindingListTypes: READS,
  HandlerServiceBindingValidate: READS,
  HandlerSystem: READS,
  HandlerUnitTestResult: READS,
  HandlerUnitTestRun: READS,
  HandlerUnitTestStatus: READS,
  HandlerValidate: READS,
};

/** The read tools that offer a delivered program on cloud (measured table). */
const READS_PROGRAM_ON_CLOUD = [
  'HandlerCheckRun',
  'HandlerDeletionCheck',
  'HandlerGet',
] as const;

describe('compact tools and PROGRAM on ABAP cloud', () => {
  // The opt-in data tool too: a compact binary serves it on request.
  const entries = [
    ...compactReadOnlyEntries(),
    ...compactDataEntries(),
    ...compactModifyEntries(),
  ];

  /** The tool's cloud statement: its description and the members it offers. */
  const onCloud = (entry: (typeof entries)[number]) => {
    const definition = entry.toolDefinition;
    if (!definition.available_in?.includes('cloud')) return undefined;
    // A tool with no variants states one definition for every system it is
    // served on: on cloud, that one.
    const stated = definition.variants?.cloud ?? definition;
    const schema = listedJson(stated.inputSchema);
    const members = [
      ...(jsonFind(schema, 'object_type')?.enum ?? []),
      ...(jsonFind(schema, 'target_type')?.enum ?? []),
    ].filter((value) => typeof value === 'string');
    return { description: stated.description, members };
  };

  /** Whether the cloud statement offers PROGRAM: as a member, or by name. */
  const offersProgram = (stated: {
    description: string;
    members: readonly string[];
  }) =>
    stated.members.includes('PROGRAM') ||
    /\bPROGRAM\b/.test(stated.description);

  it('classifies every compact tool, and no other', () => {
    assert.deepStrictEqual(
      entries.map((entry) => entry.toolDefinition.name).sort(),
      Object.keys(KIND_OF).sort(),
    );
  });

  it('reads the cloud descriptions, so the checks below are not vacuous', () => {
    const read = entries
      .map(onCloud)
      .filter((stated) => stated !== undefined && stated.description !== '');
    assert.ok(read.length > 0);
    // Every write tool of KIND_OF is served on cloud and yields a cloud
    // statement there, variants or not, so the write rule below examines
    // each of them: none is skipped as absent from cloud.
    const writesOnCloud = entries
      .filter(
        (entry) =>
          KIND_OF[entry.toolDefinition.name] === WRITES &&
          onCloud(entry) !== undefined,
      )
      .map((entry) => entry.toolDefinition.name)
      .sort();
    assert.deepStrictEqual(
      writesOnCloud,
      Object.keys(KIND_OF)
        .filter((name) => KIND_OF[name] === WRITES)
        .sort(),
    );
  });

  it('a tool that creates or changes an object offers PROGRAM on cloud only as onprem only', () => {
    const offending = entries
      .filter((entry) => KIND_OF[entry.toolDefinition.name] === WRITES)
      .flatMap((entry) => {
        const stated = onCloud(entry);
        if (stated === undefined || !offersProgram(stated)) return [];
        return stated.description.includes('onprem only')
          ? []
          : [entry.toolDefinition.name];
      });
    assert.deepStrictEqual(offending, []);
  });

  it('a tool that reads or checks offers a delivered program on cloud', () => {
    assert.deepStrictEqual(
      entries
        .filter((entry) => {
          const stated = onCloud(entry);
          return (
            KIND_OF[entry.toolDefinition.name] === READS &&
            stated !== undefined &&
            stated.members.includes('PROGRAM')
          );
        })
        .map((entry) => entry.toolDefinition.name)
        .sort(),
      [...READS_PROGRAM_ON_CLOUD],
    );
  });
});

/**
 * An include on ABAP cloud is read, checked for deletion and asked where it
 * is used — and nothing else: no create, write, lock, validation or
 * activation of one is offered there. Read from the tools' own cloud
 * statements, so a member a cloud list gains is caught the day it is added.
 */
describe('compact tools that offer INCLUDE on ABAP cloud', () => {
  // No handler runs here: only the definitions are read.
  const entries = [...compactReadOnlyEntries(), ...compactModifyEntries()];

  /** The enum values of the tool's `object_type` on `variant`, if it has one. */
  const membersOn = (
    entry: (typeof entries)[number],
    variant: 'onprem' | 'cloud',
  ): readonly string[] => {
    const stated = entry.toolDefinition.variants?.[variant];
    if (stated === undefined) return [];
    const values = jsonFind(
      listedJson(stated.inputSchema),
      'object_type',
    )?.enum;
    return (values ?? []).filter((value) => typeof value === 'string');
  };

  it('finds tools that offer INCLUDE on premise, so the check is not vacuous', () => {
    assert.ok(
      entries.filter((entry) => membersOn(entry, 'onprem').includes('INCLUDE'))
        .length > 5,
    );
  });

  it('offers it only where cloud serves it', () => {
    assert.deepStrictEqual(
      entries
        .filter((entry) => membersOn(entry, 'cloud').includes('INCLUDE'))
        .map((entry) => entry.toolDefinition.name)
        .sort(),
      ['HandlerDeletionCheck', 'HandlerGet'],
    );
  });
});
