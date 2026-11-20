import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCheckRunResponse } from '../../lib/checkRunParser';
import { normalizeCheckResponse } from '../../lib/normalizeCheckResponse';
import { assertThrows } from '../helpers/assertions';

describe('normalizeCheckResponse', () => {
  it('should add object_name and strip session fields from success response', () => {
    const lowLevelResult = {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            class_name: 'ZCL_TEST',
            check_result: {
              success: true,
              status: 'processed',
              errors: [],
              warnings: [],
              info: [],
              total_messages: 0,
              has_errors: false,
              has_warnings: false,
              message: '',
            },
            message: 'Class ZCL_TEST has no syntax errors',
          }),
        },
      ],
    };

    const result = normalizeCheckResponse(lowLevelResult, 'ZCL_TEST');

    assert.equal(result.isError, false);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.object_name, 'ZCL_TEST');
    assert.equal(data.class_name, 'ZCL_TEST');
    assert.equal(data.success, true);
    assert.notEqual(data.check_result, undefined);
    assert.notEqual(data.message, undefined);
  });

  it('should pass through error responses unchanged', () => {
    const errorResult = {
      isError: true,
      content: [{ type: 'text' as const, text: 'Error: Class not found' }],
    };

    const result = normalizeCheckResponse(errorResult, 'ZCL_TEST');

    assert.equal(result, errorResult);
  });

  it('should pass through non-JSON responses unchanged', () => {
    const nonJsonResult = {
      isError: false,
      content: [{ type: 'text' as const, text: 'not valid json' }],
    };

    const result = normalizeCheckResponse(nonJsonResult, 'ZCL_TEST');

    assert.equal(result, nonJsonResult);
  });
});

/**
 * `parseCheckRunResponse` (`src/lib/checkRunParser.ts`) has no caller left in
 * `src` — grepped clean — but the compiler still names it (`response:
 * IAdtResponse | AxiosResponse` no longer type-checks under adt-clients 19's
 * `IAdtResponse`, which dropped `.data`/`.status` entirely). The fix narrows
 * the parameter to `AxiosResponse` alone, since every value this function
 * ever received was the old transport-frame shape with `.data` on it, never
 * the new envelope. Pinned here against two real fixtures rather than
 * invented XML, so a future caller inherits a tested parser, not a
 * type-checked guess.
 */
describe('parseCheckRunResponse', () => {
  function axios(data: string) {
    return {
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    } as any;
  }

  it('reads a clean check report as success — tests/fixtures/adt/check-success-verdict--01-checkrun.body.xml', () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="/sap/bc/adt/oo/classes/zbp_mcp_shr_i_root" chkrun:status="processed" chkrun:statusText="Object ZBP_MCP_SHR_I_ROOT has been checked"/></chkrun:checkRunReports>';

    const result = parseCheckRunResponse(axios(xml));

    assert.equal(result.success, true);
    assert.equal(result.status, 'processed');
    assert.equal(result.message, 'Object ZBP_MCP_SHR_I_ROOT has been checked');
    assert.deepStrictEqual(result.errors, []);
    assert.equal(result.has_errors, false);
    assert.equal(result.total_messages, 0);
  });

  it('reads a syntax-error report as a failure with the error bucketed — tests/fixtures/adt/refusal-syntax-check--01-checkrun.body.xml', () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="/sap/bc/adt/oo/classes/zmcp_bld_ansch01" chkrun:status="processed" chkrun:statusText="Object ZMCP_BLD_ANSCH01 has been checked"><chkrun:checkMessageList><chkrun:checkMessage chkrun:uri="/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main#start=15,24;end=15,50" chkrun:type="E" chkrun:shortText="Type &quot;STRONG_BUT_NOT_A_REAL_TYPE&quot; is unknown." chkrun:code="MESSAGE(GTH)"><atom:link href="art.syntax:GTH" rel="http://www.sap.com/adt/categories/quickfixes" xmlns:atom="http://www.w3.org/2005/Atom"/></chkrun:checkMessage></chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>';

    const result = parseCheckRunResponse(axios(xml));

    assert.equal(result.success, false);
    assert.equal(result.has_errors, true);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].type, 'E');
    assert.equal(
      result.errors[0].text,
      'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
    );
    assert.equal(result.total_messages, 1);
  });
});

describe('parseCheckRunResponse — a document that cannot be read', () => {
  const throwing = (thrown: unknown): { data: string } => ({
    get data(): string {
      throw thrown;
    },
  });

  it('words the failure with what was thrown, written out', () => {
    assert.equal(
      parseCheckRunResponse(throwing(new Error('boom'))).message,
      'Failed to parse check run response: Error: boom',
    );
    assert.equal(
      parseCheckRunResponse(throwing('plain')).message,
      'Failed to parse check run response: plain',
    );
    assert.equal(
      parseCheckRunResponse(throwing(42)).message,
      'Failed to parse check run response: 42',
    );
    assert.equal(
      parseCheckRunResponse(throwing(null)).message,
      'Failed to parse check run response: null',
    );
  });

  it('cannot word a thrown Symbol: the template throws TypeError', () => {
    assertThrows(() => parseCheckRunResponse(throwing(Symbol('s'))), TypeError);
  });
});
