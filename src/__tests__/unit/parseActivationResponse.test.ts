/**
 * An activation answer's reading: its text, its `data` member, or the
 * answer written as JSON; no answer at all in fast-xml-parser's own words.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseActivationResponse } from '../../lib/utils';
import { assertMatchObject } from '../helpers/assertions';

const DOCUMENT =
  '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
  '<chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/>' +
  '</chkl:messages>';

describe('an activation answer is read from its text', () => {
  it('as text', () => {
    assertMatchObject(parseActivationResponse(DOCUMENT), {
      activated: true,
      checked: true,
      generated: false,
    });
  });

  it('from its data member', () => {
    assertMatchObject(parseActivationResponse({ data: DOCUMENT }), {
      activated: true,
      checked: true,
    });
  });

  it('an answer without a data member, written as JSON: nothing activated', () => {
    assertMatchObject(parseActivationResponse({ other: 1 }), {
      activated: false,
      checked: false,
      messages: [],
    });
  });

  it('no answer at all is the parser refusal, named', () => {
    const reading = parseActivationResponse(undefined);
    assert.equal(reading.activated, false);
    assert.equal(
      reading.messages[0]?.text,
      'Failed to parse activation response: TypeError: XML data is accepted in String or Bytes[] form.',
    );
  });
});
