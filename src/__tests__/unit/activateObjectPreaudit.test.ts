import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import { TOOL_DEFINITION } from '../../handlers/common/low/handleActivateObject';

/**
 * The single-object path takes no preaudit parameter, and every family's
 * `activate()` sends `preauditRequested=true` (adt-clients
 * `activateObjectInSession`, and the function group's and data element's own
 * request). The description says what is sent.
 */
describe("ActivateObject's preaudit, as described", () => {
  it('says what the single-object path sends', () => {
    const text = TOOL_DEFINITION.inputSchema.properties.preaudit.description;
    expect(text).toContain('preauditRequested=true');
    expect(text).not.toContain('no preaudit parameter at all');
  });

  it('ActivateObjects, which serves that handler, says the same', () => {
    const text = ActivateObjects.inputSchema.properties.preaudit.description;
    expect(text).toContain('always sends preauditRequested=true');
  });
});
