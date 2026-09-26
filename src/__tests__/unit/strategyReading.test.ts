import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  parseStructure,
  statusOnly,
  structured,
  verbatim,
} from '../../lib/strategies/reading';

/**
 * The parse every structured reading shares, against real documents.
 *
 * Two rules are being tested, and both come from how the transport-tree parser
 * broke in #168: attributes survive verbatim, and a level that can repeat is
 * always an array whether SAP sent one child or eight.
 */

function wire(name: string): IAdtWireResponse {
  const meta = corpusSidecar(name);
  return {
    status: Number(meta.response.status),
    headers: meta.response.headers,
    data: corpusBody(name),
  } as unknown as IAdtWireResponse;
}

describe('the shared parse keeps what SAP sent', () => {
  it('keeps attribute keys with their namespace prefix', () => {
    const parsed = parseStructure(
      corpusBody('refusal-delete-refused--01-deletion-delete'),
    ) as any;
    const object = parsed['del:deletionResult']['del:object'][0];
    expect(object['@']['del:isDeleted']).toBe('false');
    expect(object['@']['adtcore:name']).toBe('ZMCP_BLD_ANSCH01');
  });

  it('does not coerce a zero-padded message number into a number', () => {
    const parsed = parseStructure(
      corpusBody('refusal-object-not-found--01-read-source'),
    ) as any;
    const entries = parsed['exc:exception'].properties.entry;
    const no = entries.find((e: any) => e['@'].key === 'T100KEY-NO');
    // SADT_RESOURCE/2 is a key no SAP system knows, and neither is /26.
    expect(no['#text']).toBe('002');
    expect(typeof no['#text']).toBe('string');

    const padded = parseStructure(
      corpusBody('refusal-write-not-locked--01-update-source'),
    ) as any;
    const no026 = padded['exc:exception'].properties.entry.find(
      (e: any) => e['@'].key === 'T100KEY-NO',
    );
    expect(no026['#text']).toBe('026');
  });

  it('gives an array for a level that repeats, with one child', () => {
    // The activation document carries exactly one <msg>.
    const parsed = parseStructure(
      corpusBody('refusal-activation-fails--01-activation'),
    ) as any;
    expect(Array.isArray(parsed['chkl:messages'].msg)).toBe(true);
    expect(parsed['chkl:messages'].msg).toHaveLength(1);
  });

  it('gives an array for the same level with many children', () => {
    const parsed = parseStructure(
      corpusBody('read-object-tree-structure--01-nodestructure'),
    ) as any;
    const types =
      parsed['asx:abap']['asx:values'].DATA.OBJECT_TYPES
        .SEU_ADT_OBJECT_TYPE_INFO;
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(1);
  });

  it('answers null for a body that is not XML, rather than throwing', () => {
    expect(parseStructure('')).toBeNull();
    expect(parseStructure(undefined)).toBeNull();
  });
});

describe('a reading carries the document beside the parse', () => {
  it('keeps raw exactly as it arrived', () => {
    const name = 'refusal-syntax-check--01-checkrun';
    const result = structured(wire(name));
    expect(result.raw).toBe(corpusBody(name));
    expect(result.value).not.toBeNull();
  });

  it('keeps the status, because for some members it is the whole verdict', () => {
    const result = structured(
      wire('refusal-write-not-locked--01-update-source'),
    );
    expect(result.status).toBe(423);
  });

  it('source text is the answer, not something parsed out of it', () => {
    const name = 'read-class-source-text--01-read-source';
    const result = verbatim(wire(name));
    expect(result.value).toBe(corpusBody(name));
    expect(result.value).toContain('CLASS');
  });

  it('a member that answers nothing still reports its status', () => {
    const name = 'create-class--01-oo-classes';
    expect(corpusBody(name)).toBe('');
    const result = statusOnly(wire(name));
    expect(result.value).toBeUndefined();
    expect(result.status).toBe(200);
    expect(result.raw).toBe('');
  });

  it('a create that answers a document keeps it', () => {
    const name = 'create-domain--01-ddic-domains';
    const result = structured(wire(name));
    expect(result.status).toBe(201);
    expect(result.raw.length).toBeGreaterThan(0);
    expect(result.value).not.toBeNull();
  });
});
