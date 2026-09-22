import { handleHandlerActivate } from '../../handlers/compact/high/handleHandlerActivate';

/**
 * What `HandlerActivate` does with an `object_type` it cannot translate.
 *
 * The tool takes `object_type` like every other `Handler*` tool, which is the
 * convenience it was changed for. But the schema admits 25 object types and
 * `handleActivateObject`'s map knows eleven friendly names — so lowercasing
 * whatever arrived and handing it on sent `package` where an ADT type code
 * belongs, and SAP got a malformed request instead of this tool getting a
 * refused argument. That is worse than the inconvenience it replaced: before,
 * a caller had to pass `object_adt_type`, and therefore passed something that
 * worked.
 *
 * These pin the three outcomes: a name the map knows, a type this repository
 * has a measured code for, and everything else — refused here, naming the
 * field that settles it.
 */

let sent: unknown;
jest.mock('../../handlers/common/low/handleActivateObject', () => {
  const actual = jest.requireActual(
    '../../handlers/common/low/handleActivateObject',
  );
  return {
    ...actual,
    handleActivateObject: (_context: unknown, args: unknown) => {
      sent = args;
      return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
    },
  };
});

const context = {} as never;
const typeSent = () =>
  (sent as { objects: { type: string }[] }).objects[0].type;
const nameSent = () =>
  (sent as { objects: { name: string }[] }).objects[0].name;
const parentSent = () =>
  (sent as { objects: { parentName?: string }[] }).objects[0].parentName;

describe('HandlerActivate and the type it was given', () => {
  it('passes a friendly name the activation map knows, as it always did', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZCL_X',
      object_type: 'CLASS',
    });

    expect(typeSent()).toBe('class');
  });

  it('translates a type the map has no name for but this repository has seen', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZMCP_PKG',
      object_type: 'PACKAGE',
    });

    // `DEVC/K`, from twenty corpus documents — not a guess made here.
    expect(typeSent()).toBe('DEVC/K');
  });

  it('prefers the explicit ADT type when the caller gives one', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZCL_X',
      object_type: 'CLASS',
      object_adt_type: 'CLAS/OC',
    });

    expect(typeSent()).toBe('CLAS/OC');
  });

  /**
   * **The case this file exists for.** `UNIT_TEST` is in the schema, has no
   * friendly name in the map and no measured ADT code here. Lowercased and
   * handed on it would have reached the server as `unit_test`.
   */
  it('refuses a type it cannot translate, rather than inventing one', async () => {
    sent = undefined;

    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'UNIT_TEST',
      }),
    ).rejects.toThrow(/cannot turn object_type "UNIT_TEST"/);

    // And nothing was sent: the refusal is here, not at SAP.
    expect(sent).toBeUndefined();
  });

  it('names the field that settles it, and what it knows without it', async () => {
    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/object_adt_type/);

    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/PACKAGE/);
  });

  /**
   * **A right type code is not a right address.** `FUGR/FF` was in the
   * translation table for one commit — it is the correct type for a function
   * module — and that was the wrong fix: a module's ADT address is built
   * under its function GROUP, and this form carries one name. Given only the
   * module's, group activation would address a group by that name, which is
   * a confident request for an object that does not exist.
   */
  it('refuses a function module from a name alone, and says what does work', async () => {
    sent = undefined;

    await expect(
      handleHandlerActivate(context, {
        object_name: 'Z_AC_FM01',
        object_type: 'FUNCTION_MODULE',
      }),
    ).rejects.toThrow(/addressed under its function group/);

    expect(sent).toBeUndefined();
  });

  /**
   * The route the refusal recommends. What makes it the right one is asserted
   * in `activationUriIsBuiltFromTheParent.test.ts`, against the builder the
   * activation path actually calls — this case only checks that the fields
   * travel.
   */
  it('activates a function module through the batch form, with its group', async () => {
    await handleHandlerActivate(context, {
      objects: [
        { name: 'Z_AC_FM01', type: 'FUGR/FF', parentName: 'ZAC_FGR01' },
      ],
    });

    expect(typeSent()).toBe('FUGR/FF');
    expect(nameSent()).toBe('Z_AC_FM01');
    expect(parentSent()).toBe('ZAC_FGR01');
  });

  it('says so in the refusal, so the caller does not have to find out', async () => {
    await expect(
      handleHandlerActivate(context, {
        object_name: 'Z_AC_FM01',
        object_type: 'FUNCTION_MODULE',
      }),
    ).rejects.toThrow(/parentName/);
  });

  it('still takes a batch untouched', async () => {
    await handleHandlerActivate(context, {
      objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
    });

    expect(typeSent()).toBe('CLAS/OC');
  });
});
