/**
 * The integration setup states the system kind before it connects: the
 * config's `environment.system_type`, else `SAP_SYSTEM_TYPE`. A destination's
 * session file need not state one (the trial's does not), so without this the
 * setup's connection was refused `system_type_required` before anything was
 * sent, and the refresh through the refresh token never ran.
 */
import { setupSystemKind } from '../../integration/helpers/setupSystemKind';

describe('setupSystemKind', () => {
  it('takes the config’s environment.system_type', () => {
    expect(setupSystemKind({ environment: { system_type: 'cloud' } }, {})).toBe(
      'cloud',
    );
    expect(
      setupSystemKind({ environment: { system_type: 'legacy' } }, {}),
    ).toBe('onprem');
  });

  it('states the config’s kind over SAP_SYSTEM_TYPE', () => {
    expect(
      setupSystemKind(
        { environment: { system_type: 'cloud' } },
        { SAP_SYSTEM_TYPE: 'onprem' },
      ),
    ).toBe('cloud');
  });

  it('falls back to SAP_SYSTEM_TYPE when the config states none', () => {
    expect(setupSystemKind({}, { SAP_SYSTEM_TYPE: 'onprem' })).toBe('onprem');
  });

  it('answers undefined when nothing states a kind', () => {
    expect(setupSystemKind({ environment: {} }, {})).toBeUndefined();
  });
});
