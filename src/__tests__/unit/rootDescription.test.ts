import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertThrows } from '../helpers/assertions';
import { withRootDescription } from '../integration/helpers/rootDescription';

/**
 * The live tests' own change to a document: the root's description, never
 * another element's, set or added, escaped.
 */
describe('withRootDescription', () => {
  const declared = '<?xml version="1.0" encoding="utf-8"?>';

  it('sets the root description and leaves a reference description alone', () => {
    const document = `${declared}<inc:include adtcore:name="Z" adtcore:description="old"><adtcore:packageRef adtcore:description="pkg"/></inc:include>`;
    assert.equal(
      withRootDescription(document, 'new'),
      `${declared}<inc:include adtcore:name="Z" adtcore:description="new"><adtcore:packageRef adtcore:description="pkg"/></inc:include>`,
    );
  });

  it('adds it on the root when the root has none, even when a child has one', () => {
    const document = `${declared}<!-- c --><r a="1"><adtcore:packageRef adtcore:description="pkg"/></r>`;
    assert.equal(
      withRootDescription(document, 'new'),
      `${declared}<!-- c --><r a="1" adtcore:description="new"><adtcore:packageRef adtcore:description="pkg"/></r>`,
    );
  });

  it('adds it on a self-closing root', () => {
    assert.equal(
      withRootDescription('<r/>', 'x'),
      '<r adtcore:description="x"/>',
    );
  });

  it('escapes the value', () => {
    assert.equal(
      withRootDescription('<r adtcore:description="a"/>', `<&">`),
      '<r adtcore:description="&lt;&amp;&quot;&gt;"/>',
    );
  });

  it('does not take an attribute whose name only ends the same', () => {
    assert.equal(
      withRootDescription('<r x:adtcore:description="k"/>', 'v'),
      '<r x:adtcore:description="k" adtcore:description="v"/>',
    );
  });

  it('refuses a document without a root element', () => {
    assertThrows(
      () => withRootDescription('', 'v'),
      'The document has no root element to describe.',
    );
  });
});
