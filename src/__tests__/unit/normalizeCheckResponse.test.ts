import { parseCheckRunResponse } from '../../lib/checkRunParser';
import { normalizeCheckResponse } from '../../lib/normalizeCheckResponse';

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
            session_id: 'abc123',
            session_state: { cookies: 'x=y' },
            message: 'Class ZCL_TEST has no syntax errors',
          }),
        },
      ],
    };

    const result = normalizeCheckResponse(lowLevelResult, 'ZCL_TEST');

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.object_name).toBe('ZCL_TEST');
    expect(data.class_name).toBe('ZCL_TEST');
    expect(data.success).toBe(true);
    expect(data.check_result).toBeDefined();
    expect(data.message).toBeDefined();
    expect(data).not.toHaveProperty('session_id');
    expect(data).not.toHaveProperty('session_state');
  });

  it('should pass through error responses unchanged', () => {
    const errorResult = {
      isError: true,
      content: [{ type: 'text' as const, text: 'Error: Class not found' }],
    };

    const result = normalizeCheckResponse(errorResult, 'ZCL_TEST');

    expect(result).toBe(errorResult);
  });

  it('should pass through non-JSON responses unchanged', () => {
    const nonJsonResult = {
      isError: false,
      content: [{ type: 'text' as const, text: 'not valid json' }],
    };

    const result = normalizeCheckResponse(nonJsonResult, 'ZCL_TEST');

    expect(result).toBe(nonJsonResult);
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

    expect(result.success).toBe(true);
    expect(result.status).toBe('processed');
    expect(result.message).toBe('Object ZBP_MCP_SHR_I_ROOT has been checked');
    expect(result.errors).toEqual([]);
    expect(result.has_errors).toBe(false);
    expect(result.total_messages).toBe(0);
  });

  it('reads a syntax-error report as a failure with the error bucketed — tests/fixtures/adt/refusal-syntax-check--01-checkrun.body.xml', () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="/sap/bc/adt/oo/classes/zmcp_bld_ansch01" chkrun:status="processed" chkrun:statusText="Object ZMCP_BLD_ANSCH01 has been checked"><chkrun:checkMessageList><chkrun:checkMessage chkrun:uri="/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main#start=15,24;end=15,50" chkrun:type="E" chkrun:shortText="Type &quot;STRONG_BUT_NOT_A_REAL_TYPE&quot; is unknown." chkrun:code="MESSAGE(GTH)"><atom:link href="art.syntax:GTH" rel="http://www.sap.com/adt/categories/quickfixes" xmlns:atom="http://www.w3.org/2005/Atom"/></chkrun:checkMessage></chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>';

    const result = parseCheckRunResponse(axios(xml));

    expect(result.success).toBe(false);
    expect(result.has_errors).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('E');
    expect(result.errors[0].text).toBe(
      'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
    );
    expect(result.total_messages).toBe(1);
  });
});
