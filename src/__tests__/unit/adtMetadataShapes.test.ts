import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  ADT_CORPUS_DIR,
  corpusBody,
  corpusSidecar,
} from '../helpers/adtCorpus';

/**
 * Metadata is not one shape repeated per object type.
 *
 * That assumption was made in this session and was wrong. Eight families were
 * then read off one system, and they answered eight different media types and
 * seven different root elements. A reading proved against a table says nothing
 * about a class, and a result strategy written once for "metadata" would be
 * wrong seven times out of eight.
 *
 * This test exists to keep that fact in the repository rather than in a
 * conversation. It asserts the divergence, not any particular parse.
 */

interface Sidecar {
  case: string;
  response: {
    status: number | string;
    headers: Record<string, string>;
    bodyFile: string;
  };
}

function metadataFixtures(): Array<{
  family: string;
  sidecar: Sidecar;
  body: string;
}> {
  return fs
    .readdirSync(ADT_CORPUS_DIR)
    .filter((f) => f.startsWith('read-metadata-') && f.endsWith('.json'))
    .map((f) => {
      const sidecar: Sidecar = JSON.parse(
        fs.readFileSync(path.join(ADT_CORPUS_DIR, f), 'utf-8'),
      );
      return {
        family: sidecar.case.replace('read-metadata-', ''),
        sidecar,
        body: fs.readFileSync(
          path.join(ADT_CORPUS_DIR, sidecar.response.bodyFile),
          'utf-8',
        ),
      };
    });
}

function mediaType(s: Sidecar): string {
  return (s.response.headers['content-type'] ?? '').split(';')[0].trim();
}

function rootElement(body: string): string {
  return (
    /<(\w+:\w+)[\s>]/.exec(body)?.[1] ?? /<(\w+)[\s>]/.exec(body)?.[1] ?? ''
  );
}

describe('object metadata differs by family', () => {
  const fixtures = metadataFixtures();

  it('covers more than one family, or it proves nothing', () => {
    assert.ok(fixtures.length >= 8);
  });

  for (const [_family, f] of fixtures.map((f) => [f.family, f] as const)) {
    it(format('%s answers 200 with a body', _family), () => {
      assert.equal(f.sidecar.response.status, 200);
      assert.ok(f.body.length > 0);
    });
  }

  it('every family negotiates its own media type', () => {
    const types = fixtures.map((f) => mediaType(f.sidecar));
    assert.equal(new Set(types).size, fixtures.length);
  });

  it('the root elements diverge too, and the one collision is honest', () => {
    const roots = new Map<string, string[]>();
    for (const f of fixtures) {
      const r = rootElement(f.body);
      roots.set(r, [...(roots.get(r) ?? []), f.family]);
    }
    // blue:blueSource is shared by the structure and the behavior definition —
    // DDIC's generic envelope — and even there the media types differ, which is
    // what a reading would have to dispatch on.
    const shared = [...roots.entries()].filter(([, fams]) => fams.length > 1);
    assert.deepStrictEqual(
      shared.map(([root]) => root),
      ['blue:blueSource'],
    );
    assert.ok(roots.size >= 7);
  });

  it('no two families would be served by one parse keyed on the root alone', () => {
    const structure = fixtures.find((f) => f.family === 'structure');
    const bdef = fixtures.find((f) => f.family === 'behavior-definition');
    assert.equal(
      rootElement(structure?.body ?? ''),
      rootElement(bdef?.body ?? ''),
    );
    assert.notEqual(mediaType(structure!.sidecar), mediaType(bdef!.sidecar));
  });
});
