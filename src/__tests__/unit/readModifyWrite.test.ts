import * as fs from 'node:fs';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces';
import { XMLBuilder } from 'fast-xml-parser';
import { ADT_CORPUS_DIR, corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  parseStructure,
  structured,
  verbatim,
} from '../../lib/strategies/reading';

/**
 * Why an XML-bodied object must be read with `verbatim`.
 *
 * adt-clients 19 removed the merge that used to happen inside the member:
 * `updateDomain(connection, args, document, lockHandle)` takes the whole
 * document, and its own doc says it plainly — "This is a replace, never a
 * merge. Read what the object holds, change what you mean to change, and pass
 * the result: anything left out is gone, because nothing is read here to keep
 * it."
 *
 * So an update of a domain, a data element, a function group, a package or a
 * table type is a read-modify-write the handler performs, and the read that
 * feeds it must hand back the document unchanged. A reading that parsed and
 * re-serialised would write back whatever its parse happened to keep.
 *
 * Five families take a whole document on 19; the corpus has metadata for eight.
 */

const XML_BODIED = [
  'read-metadata-package--01-packages-zmcpshrpkg',
  'read-metadata-function-group--01-groups-zmcpshrfgrp',
];

const ALL_METADATA = fs
  .readdirSync(ADT_CORPUS_DIR)
  .filter((f) => f.startsWith('read-metadata-') && f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length));

function wire(name: string): IAdtWireResponse {
  return {
    status: Number(corpusSidecar(name).response.status),
    headers: corpusSidecar(name).response.headers,
    data: corpusBody(name),
  } as unknown as IAdtWireResponse;
}

describe('the read that feeds a write gives the document back untouched', () => {
  it.each(ALL_METADATA)('%s survives verbatim, byte for byte', (name) => {
    expect(verbatim(wire(name)).raw).toBe(corpusBody(name));
    expect(verbatim(wire(name)).value).toBe(corpusBody(name));
  });

  it.each(
    XML_BODIED,
  )('%s is a family whose update replaces the whole document', (name) => {
    // Nothing clever here: the point is that the bytes a handler would send
    // back are the bytes it read, with its own edit and nothing else.
    const read = verbatim(wire(name)).value as string;
    const edited = read.replace(
      /adtcore:description="[^"]*"/,
      'adtcore:description="edited"',
    );
    expect(edited).not.toBe(read);
    expect(edited.length).toBeCloseTo(read.length, -2);
    // everything outside the edit is identical
    expect(edited.replace('adtcore:description="edited"', '')).toBe(
      read.replace(/adtcore:description="[^"]*"/, ''),
    );
  });
});

describe('why a parsed reading cannot feed a write', () => {
  it('a parse is not a document, and re-serialising it is not the same bytes', () => {
    const name = 'read-metadata-package--01-packages-zmcpshrpkg';
    const parsed = structured(wire(name)).value;
    expect(typeof parsed).toBe('object');
    // The parse is faithful enough to read from and not a document to write.
    expect(JSON.stringify(parsed)).not.toBe(corpusBody(name));
  });

  it('re-serialising the parse does not reproduce the bytes', () => {
    const name = 'read-metadata-package--01-packages-zmcpshrpkg';
    const body = corpusBody(name);
    const parsed = parseStructure(body) as Record<string, unknown>;

    // The parse is faithful — it even keeps the prolog, which I had assumed it
    // dropped until the test said otherwise.
    expect(Object.keys(parsed)).toContain('?xml');

    // And it still is not the document. Building it back changes the bytes:
    // attribute order, self-closing forms and whitespace are the parser's
    // choices, not SAP's. A handler that wrote this back would be sending a
    // document it composed, not the one it read.
    const rebuilt = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      attributesGroupName: '@',
      suppressEmptyNode: true,
    }).build(parsed) as string;
    expect(rebuilt).not.toBe(body);
  });
});
