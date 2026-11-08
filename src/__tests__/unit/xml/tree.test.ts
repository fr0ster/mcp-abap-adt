/**
 * The reader of parsed documents (`src/lib/xml/tree.ts`), each predicate and
 * reader over documents of the corpus (`tests/fixtures/adt`) parsed as the
 * readers parse them (`parseStructure`), and over JSON.
 */

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
    expect(isElement(inactive)).toBe(true);
    expect(isElement(child(inactive, 'ioc:inactiveObjects'))).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 1],
    ['an array', [{}]],
  ])('%s is not an element', (_shown, value) => {
    expect(isElement(value)).toBe(false);
  });
});

describe('isList and listOf', () => {
  it('an array is a list, read as it is', () => {
    const list = [1, 2];
    expect(isList(list)).toBe(true);
    expect(listOf(list)).toBe(list);
  });

  it('one element is a list of itself; nothing is an empty list', () => {
    const transport = childAt(
      elements(childAt(inactive, 'ioc:inactiveObjects', 'ioc:entry'))[0],
      'ioc:transport',
    );
    expect(isList(transport)).toBe(false);
    expect(listOf(transport)).toEqual([transport]);
    expect(listOf(undefined)).toEqual([]);
    expect(listOf(null)).toEqual([]);
  });
});

describe('elements', () => {
  it('the repeated entries of a corpus document, in order', () => {
    const entriesOf = elements(
      childAt(inactive, 'ioc:inactiveObjects', 'ioc:entry'),
    );
    expect(entriesOf).toHaveLength(3);
    expect(
      entriesOf.map((entry) =>
        attr(
          child(elements(child(entry, 'ioc:object'))[0], '@'),
          'ioc:deleted',
        ),
      ),
    ).toEqual([undefined, 'false', 'false']);
  });

  it('members that are not elements are left out', () => {
    expect(elements([{ a: 1 }, 'x', null, [1]])).toEqual([{ a: 1 }]);
  });
});

describe('child and childAt', () => {
  it('reads down a corpus document', () => {
    const reports = childAt(
      checked,
      'chkrun:checkRunReports',
      'chkrun:checkReport',
    );
    expect(isList(reports)).toBe(true);
    expect(attr(child(elements(reports)[0], '@'), 'chkrun:status')).toBe(
      'processed',
    );
  });

  it('a step that names nothing, or a value that is no element, is undefined', () => {
    expect(child(checked, 'no:such')).toBeUndefined();
    expect(
      childAt(checked, 'chkrun:checkRunReports', 'no:such', 'deeper'),
    ).toBeUndefined();
    expect(child('text', 'length')).toBeUndefined();
    expect(child([{ a: 1 }], '0')).toBeUndefined();
  });
});

describe('text', () => {
  it('a string, a number and a boolean read as text', () => {
    expect(text('x')).toBe('x');
    expect(text(5)).toBe('5');
    expect(text(false)).toBe('false');
  });

  it("an element's text node", () => {
    expect(text({ '#text': 'inner', '@': { a: '1' } })).toBe('inner');
    expect(text({ _text: 'inner' }, '_text')).toBe('inner');
  });

  it('an element without text, an array, null and undefined have none', () => {
    expect(text({ a: '1' })).toBeUndefined();
    expect(text({ '#text': { nested: 'x' } })).toBeUndefined();
    expect(text(['x'])).toBeUndefined();
    expect(text(null)).toBeUndefined();
    expect(text(undefined)).toBeUndefined();
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
    expect(attr(ref, 'adtcore:name')).toBe('ZMCP_BLD_FGR_L1');
    expect(attr(ref, 'adtcore:type')).toBe('FUGR/F');
  });

  it('a member that is no scalar, or none, is undefined', () => {
    expect(attr({ a: { b: 1 } }, 'a')).toBeUndefined();
    expect(attr({ a: ['x'] }, 'a')).toBeUndefined();
    expect(attr({}, 'a')).toBeUndefined();
    expect(attr('x', 'a')).toBeUndefined();
    expect(attr({ a: 3 }, 'a')).toBe('3');
  });
});

describe('entries', () => {
  it("an element's members in their order; anything else has none", () => {
    const parsed: unknown = JSON.parse('{"b":1,"a":"x"}');
    expect(entries(parsed)).toEqual([
      ['b', 1],
      ['a', 'x'],
    ]);
    expect(entries(['x'])).toEqual([]);
    expect(entries('x')).toEqual([]);
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
    expect(firstAttribute(doc, 'n')).toBe('1');
    expect(firstAttributeOn(doc, 'p', 'n')).toBe('1');
    expect(walkStructure(doc).map((visit) => visit.name)).toEqual([
      'r',
      'x',
      'x',
      'p',
      'p',
    ]);
  });
});

describe('parseStructure decodes character references', () => {
  it('a decimal and a hexadecimal reference, in an attribute and in text', () => {
    const doc = parseStructure('<r t="A&#39;B&#x26;C">x&#10;y &amp; z</r>');
    expect(attributeOf(child(doc, 'r'), 't')).toBe("A'B&C");
    expect(text(child(doc, 'r'))).toBe('x\ny & z');
  });
});
