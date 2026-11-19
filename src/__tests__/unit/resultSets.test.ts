import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classDocuments,
  classTestRunnerDocuments,
  domainDocuments,
  packageDocuments,
  tableDocuments,
  utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  unitTestRunId,
  utilActivationRunId,
} from '@mcp-abap-adt/adt-strategies';
import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../lib/strategies/reading';
import {
  ourUnitTest,
  ourUtils,
  READING_BY_SLOT,
  resultsFor,
} from '../../lib/strategies/resultSets';
import { corpusBody, corpusSidecar } from '../helpers/adtCorpus';
import { assertThrows } from '../helpers/assertions';

describe('the slot table', () => {
  it('knows a reading for every slot every shipped set declares', () => {
    const m = require('@mcp-abap-adt/adt-clients');
    const unknown: string[] = [];
    for (const key of Object.keys(m).filter((k) => /Documents$/.test(k))) {
      for (const slot of Object.keys(m[key])) {
        if (!Object.hasOwn(READING_BY_SLOT, slot))
          unknown.push(`${key}.${slot}`);
      }
    }
    // A slot adt-clients adds arrives here, not as an unshaped answer at a call site.
    assert.deepStrictEqual(unknown, []);
  });

  it('keeps the keys of the set it stamps', () => {
    assert.deepStrictEqual(
      Object.keys(resultsFor(domainDocuments)).sort(),
      Object.keys(domainDocuments).sort(),
    );
  });

  it('hands a metadata document through, character for character', () => {
    const document = corpusBody(
      'read-table-metadata-structure--01-tables-zmcpshrrtabl',
    );
    const reading: any = resultsFor(tableDocuments).metadata({
      data: document,
      status: 200,
    } as any);
    assert.equal(reading.raw, document);
  });

  it('parses a check document into named structure, keeping the document beside it', () => {
    const document = corpusBody('check-success-verdict--01-checkrun');
    const reading: any = resultsFor(classDocuments).check({
      data: document,
      status: 200,
    } as any);
    assert.notEqual(reading.value['chkrun:checkRunReports'], undefined);
    assert.equal(reading.raw, document);
  });

  it('reads a write as its status, and still carries the document', () => {
    // `updated`, unlike `created`, has no fixture answering a body — every
    // write in the corpus is a zero-byte 200. `statusOnly` is right for it.
    const document = corpusBody('update-source-success--02-update-source');
    const reading: any = resultsFor(classDocuments).updated({
      data: document,
      status: 200,
    } as any);
    assert.equal(reading.value, undefined);
    assert.equal(reading.status, 200);
    assert.equal(reading.raw, document);
  });

  it('answers the document for a DDIC create, and still answers a status for the zero-byte class create', () => {
    const domainDocument = corpusBody('create-domain--01-ddic-domains');
    const domainReading: any = resultsFor(domainDocuments).created({
      data: domainDocument,
      status: 201,
    } as any);
    assert.equal(domainReading.value, domainDocument);
    assert.equal(domainReading.raw, domainDocument);

    const classReading: any = resultsFor(classDocuments).created({
      data: '',
      status: 200,
    } as any);
    assert.equal(classReading.status, 200);
    assert.equal(classReading.raw, '');
  });

  it('gives the walk our own node reading, not the shipped one', () => {
    assert.notEqual(ourUtils.node, utilDocuments.node);
  });

  it('keeps a kept slot as the shipped function, not the table default', () => {
    assert.equal(
      resultsFor(utilDocuments, ['activation']).activation,
      utilDocuments.activation,
    );
  });

  it('reads the run ids with the adt-strategies readings, not the shipped document', () => {
    // adt-clients 23 ships the document for both slots (MIGRATION-23 §4, §6);
    // the ids are in a header, which these two readings look at.
    assert.equal(ourUtils.activation, utilActivationRunId);
    assert.equal(ourUnitTest.run, unitTestRunId);
    assert.notEqual(ourUtils.activation, utilDocuments.activation);
    assert.notEqual(ourUnitTest.run, classTestRunnerDocuments.run);
  });

  it('reads the unit-test run id out of the Location header, not the empty body', () => {
    const sidecar = corpusSidecar('unittest-run-passing--01-abapunit-runs');
    const body = corpusBody('unittest-run-passing--01-abapunit-runs');
    const wire = {
      data: body,
      status: sidecar.response.status,
      headers: sidecar.response.headers,
    };
    // Through `ourUnitTest`, not an inline `resultsFor(...)` call — this is
    // the set a later task actually imports, so this is what the fixture
    // has to exercise.
    const reading = ourUnitTest.run(wire as any);
    assert.equal(reading, 'FA53C505DD7B1FD1ABB8599833A05D44');
  });

  it('refuses a set with a slot it does not know', () => {
    assertThrows(
      () => resultsFor({ ...packageDocuments, invented: (() => {}) as any }),
      /invented/,
    );
  });

  it('types a stamped slot as the reading it was given, not the shipped set — pinned at compile time', () => {
    // This test fails by NOT COMPILING, not by an assertion at runtime. If
    // `resultsFor` regresses to returning its input type `R` — the bug fixed
    // alongside Task 9 — `classResults.source` goes back to typing as
    // `IResultStrategy<string>` (a function returning a bare `string`) and
    // the line below stops type-checking, because `verbatim` actually
    // answers `AdtReading<string>`, not `string`. `tsc` catches that; the
    // assertion at run time cannot, so the `expect` here only proves the two
    // functions are the same referenced value — the type pin is the
    // assignment itself.
    const classResults = resultsFor(classDocuments);
    const sourceReading: IResultStrategy<AdtReading<string>> =
      classResults.source;
    assert.equal(sourceReading, READING_BY_SLOT.source);

    // The exception slots must type as the SHIPPED strategy, not the
    // table's default for that slot name — `ourUtils.activation` reads a
    // `Location` header and answers a string id, never the
    // `AdtReading<unknown>` that `structured` (the table's default for the
    // name `activation`) would produce. Also a compile-time pin: assigning
    // `ourUtils.activation` to a variable typed as the table's default shape
    // would fail to compile if `resultsFor` widened a kept slot back to it.
    const keptActivation: IResultStrategy<string> = ourUtils.activation;
    assert.equal(keptActivation, utilActivationRunId);

    const keptRun: IResultStrategy<string> = ourUnitTest.run;
    assert.equal(keptRun, unitTestRunId);
  });
});
