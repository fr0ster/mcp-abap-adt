/**
 * The typed XML node (`src/lib/xml/node.ts`): the one checked conversion of
 * a parser's answer keeps every value the parser answered, so a reader of
 * the typed node reads exactly what it read of the parser's own output.
 *
 * Proved over the recorded corpus (`tests/fixtures/adt`), each document
 * parsed under every option the server parses with, alone and combined as
 * the server combines them.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { type X2jOptions, XMLParser } from 'fast-xml-parser';
import { parseXml, xmlNodeOf } from '../../../lib/xml/node';
import { ADT_CORPUS_DIR, corpusBody } from '../../helpers/adtCorpus';

const SUFFIX = '.body.xml';

/** Every recorded XML body of the corpus that holds a document. */
function corpus(): { name: string; text: string }[] {
  return readdirSync(ADT_CORPUS_DIR)
    .filter((file) => file.endsWith(SUFFIX))
    .sort()
    .map((file) => file.slice(0, -SUFFIX.length))
    .map((name) => ({ name, text: corpusBody(name) }))
    .filter(({ text }) => text.trim() !== '');
}

/** Every option the server's parsers set, in the combinations they set them. */
const OPTION_SETS: Record<string, Partial<X2jOptions>> = {
  'attributes, prefixed': {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  },
  'attributes, coerced': {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
  },
  'attributes, bare, own text member, coerced, listed': {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    isArray: (name) => name.endsWith('request') || name.endsWith('task'),
  },
  'attributes grouped, verbatim, entities, listed': {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    attributesGroupName: '@',
    parseAttributeValue: false,
    parseTagValue: false,
    htmlEntities: true,
    isArray: (name) => name.endsWith('entry') || name.endsWith('msg'),
  },
  'no namespace prefix, untrimmed, verbatim': {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    ignoreDeclaration: true,
  },
  'trimmed, verbatim': {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  },
  ordered: {
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: false,
    cdataPropName: '#cdata',
    commentPropName: '#comment',
  },
};

describe('the typed XML node keeps what the parser answered', () => {
  const documents = corpus();

  it('reads the recorded corpus', () => {
    assert.ok(documents.length > 100, `${documents.length} documents`);
  });

  for (const [label, options] of Object.entries(OPTION_SETS)) {
    it(`every document parsed ${label} converts to an equal node`, () => {
      const parser = new XMLParser(options);
      for (const { name, text } of documents) {
        const parsed: unknown = parser.parse(text);
        const node = parseXml(parser, text);
        assert.notEqual(node, undefined, name);
        assert.deepStrictEqual(node, parsed, name);
      }
    });
  }

  it('a text value is itself; a list and an element are copies of their members', () => {
    assert.equal(xmlNodeOf('a'), 'a');
    assert.equal(xmlNodeOf(26), 26);
    assert.equal(xmlNodeOf(false), false);
    const element = { 'adtcore:name': 'ZX', list: [{ '#text': 'y' }, 1] };
    const node = xmlNodeOf(element);
    assert.deepStrictEqual(node, element);
    assert.notEqual(node, element);
  });

  it('a value no parser answers is no node, however deep', () => {
    assert.equal(xmlNodeOf(null), undefined);
    assert.equal(xmlNodeOf(undefined), undefined);
    assert.equal(xmlNodeOf([1, null]), undefined);
    assert.equal(xmlNodeOf({ a: { b: undefined } }), undefined);
    assert.equal(xmlNodeOf({ a: () => 1 }), undefined);
  });

  it('a member named __proto__ stays a member', () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"polluted": "yes"}}');
    const node = xmlNodeOf(parsed);
    assert.deepStrictEqual(Object.keys(node ?? {}), ['__proto__']);
    assert.equal(Object.getPrototypeOf(node), Object.prototype);
  });
});
