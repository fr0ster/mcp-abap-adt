/**
 * An activation answer's reading: its text, its `data` member, or the
 * answer written as JSON; no answer at all in fast-xml-parser's own words.
 */
import { parseActivationResponse } from '../../lib/utils';

const DOCUMENT =
  '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
  '<chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/>' +
  '</chkl:messages>';

describe('an activation answer is read from its text', () => {
  it('as text', () => {
    expect(parseActivationResponse(DOCUMENT)).toMatchObject({
      activated: true,
      checked: true,
      generated: false,
    });
  });

  it('from its data member', () => {
    expect(parseActivationResponse({ data: DOCUMENT })).toMatchObject({
      activated: true,
      checked: true,
    });
  });

  it('an answer without a data member, written as JSON: nothing activated', () => {
    expect(parseActivationResponse({ other: 1 })).toMatchObject({
      activated: false,
      checked: false,
      messages: [],
    });
  });

  it('no answer at all is the parser refusal, named', () => {
    const reading = parseActivationResponse(undefined);
    expect(reading.activated).toBe(false);
    expect(reading.messages[0]?.text).toBe(
      'Failed to parse activation response: TypeError: XML data is accepted in String or Bytes[] form.',
    );
  });
});
