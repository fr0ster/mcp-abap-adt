/**
 * Cluster 14: `class`, `interface`, `behavior_definition`, `behavior_implementation`.
 *
 * Task 10's per-operation table (Create/Update -> analyseException, statusOnly,
 * terseWrite; Check -> analyseCheck, structured, terseCheck; Activate ->
 * analyseActivation; Validate -> analyseValidation; Delete -> analyseDeletion;
 * Lock/Unlock -> no strategy at all) applies unchanged across every family in
 * this cluster. What differs per family is the factory, the shipped result
 * set and the config key — this file pins the pairing per family rather than
 * trusting the prose, because what goes wrong at this scale is a handler
 * taking the wrong `analyse`.
 *
 * Explicit rows rather than a family lookup: an executor reads one task and
 * must not have to reconstruct which handler a family name maps to. One row
 * is added per family as that family is migrated (and committed), and this
 * file is extended again by each of Tasks 15-17.
 */
import {
  analyseActivation,
  analyseDeletion,
  analyseValidation,
} from '@mcp-abap-adt/adt-strategies';
import { handleActivateClass } from '../../handlers/class/low/handleActivateClass';
import { handleActivateClassTestClasses } from '../../handlers/class/low/handleActivateClassTestClasses';
import { handleDeleteClass } from '../../handlers/class/low/handleDeleteClass';
import { handleLockClassTestClasses } from '../../handlers/class/low/handleLockClassTestClasses';
import { handleUnlockClassTestClasses } from '../../handlers/class/low/handleUnlockClassTestClasses';
import { handleValidateClass } from '../../handlers/class/low/handleValidateClass';
import { handleActivateInterface } from '../../handlers/interface/low/handleActivateInterface';
import { handleDeleteInterface } from '../../handlers/interface/low/handleDeleteInterface';
import { handleValidateInterface } from '../../handlers/interface/low/handleValidateInterface';
import { recordAnalyse } from '../helpers/fakeClient';

// The recorder IS the client, or it records nothing. Every test in this file
// that reads `seen.calls`/`seen.last` needs this wiring.
const seen = recordAnalyse();
jest.mock('../../lib/clients', () => ({ createAdtClient: () => seen.client }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

beforeEach(() => {
  seen.calls.length = 0;
});

it.each([
  [
    'class',
    handleActivateClass,
    handleDeleteClass,
    handleValidateClass,
    {
      class_name: 'ZCL_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  [
    'interface',
    handleActivateInterface,
    handleDeleteInterface,
    handleValidateInterface,
    {
      interface_name: 'ZIF_X',
      package_name: 'ZP',
      description: 'x',
      lock_handle: 'h',
    },
  ],
  // one row per family in this cluster
])('%s pairs each operation with its own strategy', async (_family, activate, remove, validate, args) => {
  await (activate as any)(context as any, args);
  const activateCall = seen.calls.at(-1);
  expect(activateCall?.carriedAnalyse).toBe(true);
  expect(activateCall?.analyse).toBe(analyseActivation);

  await (remove as any)(context as any, args);
  const deleteCall = seen.calls.at(-1);
  expect(deleteCall?.carriedAnalyse).toBe(true);
  expect(deleteCall?.analyse).toBe(analyseDeletion);

  await (validate as any)(context as any, args);
  const validateCall = seen.calls.at(-1);
  expect(validateCall?.carriedAnalyse).toBe(true);
  expect(validateCall?.analyse).toBe(analyseValidation);
});

describe('class — the test-classes trio shares getClass(), not a family of its own', () => {
  it('ActivateClassTestClasses activates the parent class, taking analyseActivation like ActivateClass', async () => {
    await handleActivateClassTestClasses(context as any, {
      class_name: 'ZCL_X',
    });
    const call = seen.calls.filter((c) => c.member === 'activate').at(-1);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseActivation);
    expect(call?.factory).toBe('getClass');
  });

  it('LockClassTestClasses and UnlockClassTestClasses pass no analyse — lockTestClasses/unlockTestClasses accept none', async () => {
    await handleLockClassTestClasses(context as any, { class_name: 'ZCL_X' });
    const lockCall = seen.calls
      .filter((c) => c.member === 'lockTestClasses')
      .at(-1);
    expect(lockCall?.carriedAnalyse).toBe(false);
    expect(lockCall?.analyse).toBeUndefined();
    expect(lockCall?.factory).toBe('getClass');

    await handleUnlockClassTestClasses(context as any, {
      class_name: 'ZCL_X',
      lock_handle: 'h',
    });
    const unlockCall = seen.calls
      .filter((c) => c.member === 'unlockTestClasses')
      .at(-1);
    expect(unlockCall?.carriedAnalyse).toBe(false);
    expect(unlockCall?.analyse).toBeUndefined();
    expect(unlockCall?.factory).toBe('getClass');
  });
});
