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
