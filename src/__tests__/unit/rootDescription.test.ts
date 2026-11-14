import { withRootDescription } from '../integration/helpers/rootDescription';

/**
 * The live tests' own change to a document: the root's description, never
 * another element's, set or added, escaped.
 */
describe('withRootDescription', () => {
  const declared = '<?xml version="1.0" encoding="utf-8"?>';

  it('sets the root description and leaves a reference description alone', () => {
    const document = `${declared}<inc:include adtcore:name="Z" adtcore:description="old"><adtcore:packageRef adtcore:description="pkg"/></inc:include>`;
    expect(withRootDescription(document, 'new')).toBe(
      `${declared}<inc:include adtcore:name="Z" adtcore:description="new"><adtcore:packageRef adtcore:description="pkg"/></inc:include>`,
    );
  });

  it('adds it on the root when the root has none, even when a child has one', () => {
    const document = `${declared}<!-- c --><r a="1"><adtcore:packageRef adtcore:description="pkg"/></r>`;
    expect(withRootDescription(document, 'new')).toBe(
      `${declared}<!-- c --><r a="1" adtcore:description="new"><adtcore:packageRef adtcore:description="pkg"/></r>`,
    );
  });

  it('adds it on a self-closing root', () => {
    expect(withRootDescription('<r/>', 'x')).toBe(
      '<r adtcore:description="x"/>',
    );
  });

  it('escapes the value', () => {
    expect(withRootDescription('<r adtcore:description="a"/>', `<&">`)).toBe(
      '<r adtcore:description="&lt;&amp;&quot;&gt;"/>',
    );
  });

  it('does not take an attribute whose name only ends the same', () => {
    expect(withRootDescription('<r x:adtcore:description="k"/>', 'v')).toBe(
      '<r x:adtcore:description="k" adtcore:description="v"/>',
    );
  });

  it('refuses a document without a root element', () => {
    expect(() => withRootDescription('', 'v')).toThrow(
      'The document has no root element to describe.',
    );
  });
});
