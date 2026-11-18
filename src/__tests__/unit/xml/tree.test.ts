/**
 * The reader of parsed documents (`src/lib/xml/tree.ts`), each predicate and
 * reader over documents of the corpus (`tests/fixtures/adt`) parsed as the
 * readers parse them (`parseStructure`), and over JSON.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  attributeOf,
  firstAttribute,
  firstAttributeOn,
  parseStructure,
  walkStructure,
} from '../../../lib/strategies/reading';
import {
  attr,
  child,
  childAt,
  elements,
  entries,
  isElement,
  isList,
  listOf,
  text,
} from '../../../lib/xml/tree';
import { corpusBody } from '../../helpers/adtCorpus';

const inactive = parseStructure(
  corpusBody('activation-still-inactive--01-activation'),
);
const checked = parseStructure(
  corpusBody('check-success-verdict--01-checkrun'),
);

describe('isElement', () => {
  it('a parsed document and its elements are elements', () => {
    assert.equal(isElement(inactive), true);
    assert.equal(isElement(child(inactive, 'ioc:inactiveObjects')), true);
  });

  for (const [_shown, value] of [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 1],
    ['an array', [{}]],
  ]) {
    it(format('%s is not an element', _shown), () => {
      assert.equal(isElement(value), false);
    });
  }
});

describe('isList and listOf', () => {
  it('an array is a list, read as it is', () => {
    const list = [1, 2];
    assert.equal(isList(list), true);
    assert.equal(listOf(list), list);
  });

  it('one element is a list of itself; nothing is an empty list', () => {
    const transport = childAt(
      elements(childAt(inactive, 'ioc:inactiveObjects', 'ioc:entry'))[0],
      'ioc:transport',
    );
    assert.equal(isList(transport), false);
    assert.deepStrictEqual(listOf(transport), [transport]);
    assert.deepStrictEqual(listOf(undefined), []);
    assert.deepStrictEqual(listOf(null), []);
  });
});

describe('elements', () => {
  it('the repeated entries of a corpus document, in order', () => {
    const entriesOf = elements(
      childAt(inactive, 'ioc:inactiveObjects', 'ioc:entry'),
    );
    assert.equal(entriesOf.length, 3);
    assert.deepStrictEqual(
      entriesOf.map((entry) =>
        attr(
          child(elements(child(entry, 'ioc:object'))[0], '@'),
          'ioc:deleted',
        ),
      ),
      [undefined, 'false', 'false'],
    );
  });

  it('members that are not elements are left out', () => {
    assert.deepStrictEqual(elements([{ a: 1 }, 'x', [1]]), [{ a: 1 }]);
  });
});

describe('child and childAt', () => {
  it('reads down a corpus document', () => {
    const reports = childAt(
      checked,
      'chkrun:checkRunReports',
      'chkrun:checkReport',
    );
    assert.equal(isList(reports), true);
    assert.equal(
      attr(child(elements(reports)[0], '@'), 'chkrun:status'),
      'processed',
    );
  });

  it('a step that names nothing, or a value that is no element, is undefined', () => {
    assert.equal(child(checked, 'no:such'), undefined);
    assert.equal(
      childAt(checked, 'chkrun:checkRunReports', 'no:such', 'deeper'),
      undefined,
    );
    assert.equal(child('text', 'length'), undefined);
    assert.equal(child([{ a: 1 }], '0'), undefined);
  });
});

describe('text', () => {
  it('a string, a number and a boolean read as text', () => {
    assert.equal(text('x'), 'x');
    assert.equal(text(5), '5');
    assert.equal(text(false), 'false');
  });

  it("an element's text node", () => {
    assert.equal(text({ '#text': 'inner', '@': { a: '1' } }), 'inner');
    assert.equal(text({ _text: 'inner' }, '_text'), 'inner');
  });

  it('an element without text, an array, null and undefined have none', () => {
    assert.equal(text({ a: '1' }), undefined);
    assert.equal(text({ '#text': { nested: 'x' } }), undefined);
    assert.equal(text(['x']), undefined);
    assert.equal(text(null), undefined);
    assert.equal(text(undefined), undefined);
  });
});

describe('attr', () => {
  it("a corpus document's attribute", () => {
    const entry = elements(
      childAt(inactive, 'ioc:inactiveObjects', 'ioc:entry'),
    )[1];
    const ref = childAt(
      elements(child(entry, 'ioc:object'))[0],
      'ioc:ref',
      '@',
    );
    assert.equal(attr(ref, 'adtcore:name'), 'ZMCP_BLD_FGR_L1');
    assert.equal(attr(ref, 'adtcore:type'), 'FUGR/F');
  });

  it('a member that is no scalar, or none, is undefined', () => {
    assert.equal(attr({ a: { b: 1 } }, 'a'), undefined);
    assert.equal(attr({ a: ['x'] }, 'a'), undefined);
    assert.equal(attr({}, 'a'), undefined);
    assert.equal(attr('x', 'a'), undefined);
    assert.equal(attr({ a: 3 }, 'a'), '3');
  });
});

describe('entries', () => {
  it("an element's members in their order; anything else has none", () => {
    assert.deepStrictEqual(entries({ b: 1, a: 'x' }), [
      ['b', 1],
      ['a', 'x'],
    ]);
    assert.deepStrictEqual(entries(['x']), []);
    assert.deepStrictEqual(entries('x'), []);
  });
});

/**
 * The walkers over `parseStructure`'s grouped parse: an element before what
 * it holds, siblings of one name in their order, and siblings of different
 * names grouped by name in the order each name first appears — not document
 * order where differently named siblings interleave.
 */
describe('walkStructure and firstAttribute over the grouped parse', () => {
  it('reads the first x (and what it holds) before p, though p came between the two x', () => {
    const doc = parseStructure('<r><x/><p n="2"/><x><p n="1"/></x></r>');
    assert.equal(firstAttribute(doc, 'n'), '1');
    assert.equal(firstAttributeOn(doc, 'p', 'n'), '1');
    assert.deepStrictEqual(
      walkStructure(doc).map((visit) => visit.name),
      ['r', 'x', 'x', 'p', 'p'],
    );
  });
});

describe('parseStructure decodes character references', () => {
  it('a decimal and a hexadecimal reference, in an attribute and in text', () => {
    const doc = parseStructure('<r t="A&#39;B&#x26;C">x&#10;y &amp; z</r>');
    assert.equal(attributeOf(child(doc, 'r'), 't'), "A'B&C");
    assert.equal(text(child(doc, 'r')), 'x\ny & z');
  });
});
