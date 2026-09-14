import {
  classDocuments,
  domainDocuments,
  packageDocuments,
  tableDocuments,
  utilDocuments,
} from '@mcp-abap-adt/adt-clients';
import { corpusBody } from '../../lib/adtCorpus';
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
    const reading: any = resultsFor(classDocuments).created({
      data: '',
      status: 200,
    } as any);
    expect(reading.value).toBeUndefined();
    expect(reading.status).toBe(200);
    expect(reading.raw).toBe('');
  });

  it('gives the walk our own node reading, not the shipped one', () => {
    expect(ourUtils.node).not.toBe(utilDocuments.node);
  });

  it('refuses a set with a slot it does not know', () => {
    expect(() =>
      resultsFor({ ...packageDocuments, invented: (() => {}) as any }),
    ).toThrow(/invented/);
  });
});
