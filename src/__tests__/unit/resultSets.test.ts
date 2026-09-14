import {
  classDocuments,
  domainDocuments,
  packageDocuments,
  tableDocuments,
  unitTestDocuments,
  utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  ourUtils,
  READING_BY_SLOT,
  resultsFor,
} from '../../lib/strategies/resultSets';

describe('the slot table', () => {
  it('knows a reading for every slot every shipped set declares', () => {
    const m = require('@mcp-abap-adt/adt-clients');
    const unknown: string[] = [];
    for (const key of Object.keys(m).filter((k) => /Documents$/.test(k))) {
      for (const slot of Object.keys(m[key])) {
        if (READING_BY_SLOT[slot] === undefined) unknown.push(`${key}.${slot}`);
      }
    }
    // A slot adt-clients adds arrives here, not as an unshaped answer at a call site.
    expect(unknown).toEqual([]);
  });

  it('keeps the keys of the set it stamps', () => {
    expect(Object.keys(resultsFor(domainDocuments)).sort()).toEqual(
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
    expect(reading.raw).toBe(document);
  });

  it('parses a check document into named structure, keeping the document beside it', () => {
    const document = corpusBody('check-success-verdict--01-checkrun');
    const reading: any = resultsFor(classDocuments).check({
      data: document,
      status: 200,
    } as any);
    expect(reading.value['chkrun:checkRunReports']).toBeDefined();
    expect(reading.raw).toBe(document);
  });

  it('reads a write as its status, and still carries the document', () => {
    // `updated`, unlike `created`, has no fixture answering a body — every
    // write in the corpus is a zero-byte 200. `statusOnly` is right for it.
    const document = corpusBody('update-source-success--02-update-source');
    const reading: any = resultsFor(classDocuments).updated({
      data: document,
      status: 200,
    } as any);
    expect(reading.value).toBeUndefined();
    expect(reading.status).toBe(200);
    expect(reading.raw).toBe(document);
  });

  it('answers the document for a DDIC create, and still answers a status for the zero-byte class create', () => {
    const domainDocument = corpusBody('create-domain--01-ddic-domains');
    const domainReading: any = resultsFor(domainDocuments).created({
      data: domainDocument,
      status: 201,
    } as any);
    expect(domainReading.value).toBe(domainDocument);
    expect(domainReading.raw).toBe(domainDocument);

    const classReading: any = resultsFor(classDocuments).created({
      data: '',
      status: 200,
    } as any);
    expect(classReading.status).toBe(200);
    expect(classReading.raw).toBe('');
  });

  it('gives the walk our own node reading, not the shipped one', () => {
    expect(ourUtils.node).not.toBe(utilDocuments.node);
  });

  it('keeps a kept slot as the shipped function, not the table default', () => {
    expect(resultsFor(utilDocuments, ['activation']).activation).toBe(
      utilDocuments.activation,
    );
    expect(ourUtils.activation).toBe(utilDocuments.activation);
  });

  it('reads the unit-test run id out of the Location header, not the empty body', () => {
    const sidecar = corpusSidecar('unittest-run-passing--01-abapunit-runs');
    const body = corpusBody('unittest-run-passing--01-abapunit-runs');
    const wire = {
      data: body,
      status: sidecar.response.status,
      headers: sidecar.response.headers,
    };
    const reading = resultsFor(unitTestDocuments, ['run']).run(wire as any);
    expect(reading).toBe('FA53C505DD7B1FD1ABB8599833A05D44');
  });

  it('refuses a set with a slot it does not know', () => {
    expect(() =>
      resultsFor({ ...packageDocuments, invented: (() => {}) as any }),
    ).toThrow(/invented/);
  });
});
