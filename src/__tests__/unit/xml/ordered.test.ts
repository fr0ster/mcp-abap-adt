/**
 * The ordered form (`src/lib/xml/ordered.ts`): every XML document of the corpus
 * (`tests/fixtures/adt`) parses and builds back to its own text.
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { buildOrdered, parseOrdered } from '../../../lib/xml/ordered';
import { isList } from '../../../lib/xml/tree';
import { ADT_CORPUS_DIR, corpusBody } from '../../helpers/adtCorpus';

const SUFFIX = '.body.xml';
const cases = readdirSync(ADT_CORPUS_DIR)
  .filter((file) => file.endsWith(SUFFIX))
  .map((file) => file.slice(0, -SUFFIX.length))
  .filter((name) => corpusBody(name).trim() !== '');

/** The recorded body up to the end of its root element (one recording carries a note after it). */
function documentOf(body: string): string {
  const end = body.lastIndexOf('>');
  return body.slice(0, end + 1);
}

describe('the ordered round trip', () => {
  it('the corpus has XML documents to read', () => {
    assert.ok(cases.length > 100);
  });

  // The builder writes an apostrophe in an attribute value as `&apos;`; no
  // recorded document writes `&apos;` itself, so reading those back as `'`
  // compares the rest byte for byte.
  for (const name of cases) {
    it(format('%s builds back to its own text', name), () => {
      const body = documentOf(corpusBody(name));
      assert.equal(body.includes('&apos;'), false);
      const parsed = parseOrdered(body);
      assert.equal(isList(parsed), true);
      const built = buildOrdered(isList(parsed) ? parsed : []);
      assert.equal(built.split('&apos;').join("'"), body);
    });
  }

  it('writes an apostrophe in an attribute value as &apos; and leaves it in text', () => {
    const parsed = parseOrdered(`<a k="it's">it's</a>`);
    assert.equal(
      buildOrdered(isList(parsed) ? parsed : []),
      '<a k="it&apos;s">it\'s</a>',
    );
  });

  it('keeps entities, CDATA, comments and whitespace as they came', () => {
    const body =
      '<?xml version="1.0" encoding="utf-8"?><a:x xmlns:a="u" a:k="v &amp; w &#39; &quot;">\n  <!-- note -->\n  <a:s><![CDATA[q<b]]></a:s>\n  <a:t>&lt;it&apos;s&gt;</a:t>\n</a:x>';
    const parsed = parseOrdered(body);
    assert.equal(buildOrdered(isList(parsed) ? parsed : []), body);
  });

  it('reads a CR LF line end as LF, as XML does', () => {
    const parsed = parseOrdered('<a>x\r\ny</a>');
    assert.equal(buildOrdered(isList(parsed) ? parsed : []), '<a>x\ny</a>');
  });

  it('answers null for a body that is empty', () => {
    assert.equal(parseOrdered(''), null);
    assert.equal(parseOrdered('  '), null);
  });
});
