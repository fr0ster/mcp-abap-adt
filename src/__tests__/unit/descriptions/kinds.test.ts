/**
 * Plan step 10.6: the uniform tool kinds' descriptions (`kinds.ts`) — each
 * factory's sentence pinned for two tools of different object types, and
 * the facts of a typed result (`resultShape`, `listOf`) generated from its
 * members' nouns, a member left out or invented refused by the compiler.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activateTool,
  checkTool,
  createTool,
  deleteTool,
  listOf,
  purpose,
  resultReturns,
  resultShape,
  results,
  untypedReturns,
  updateTool,
  validateTool,
} from '../../../lib/description';
import { factFaults, purposeFaults } from './descriptionRules';

const WRITTEN = 'Whether SAP took the change.';
const UNDER_LOCK =
  'Whether SAP took the change and a lock left held when its release failed.';
const MESSAGES =
  "For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.";

describe('the kind factories', () => {
  it('create: the object, what the inputs add, whether SAP took it', () => {
    assert.equal(
      createTool({
        object: 'an ABAP class',
        how: 'in a package, with its description',
      }),
      `Creates an ABAP class in a package, with its description. ${WRITTEN}`,
    );
    assert.equal(
      createTool({ object: 'an ABAP domain', how: 'in a package' }),
      `Creates an ABAP domain in a package. ${WRITTEN}`,
    );
  });

  it('update: whether SAP took it, and a lock left held', () => {
    assert.equal(
      updateTool({
        object: 'the source code of an ABAP interface',
        how: ', activating it when asked',
      }),
      `Updates the source code of an ABAP interface, activating it when asked. ${UNDER_LOCK}`,
    );
    assert.equal(
      updateTool({ object: 'the description of an ABAP package' }),
      `Updates the description of an ABAP package. ${UNDER_LOCK}`,
    );
  });

  it("delete: SAP's deletion verdict", () => {
    const deleted =
      "Whether SAP deleted the object, its name and SAP's message about it.";
    assert.equal(
      deleteTool({ object: 'an ABAP class' }),
      `Deletes an ABAP class. ${deleted}`,
    );
    assert.equal(
      deleteTool({ object: 'an ABAP domain', tag: 'low-level' }),
      `[low-level] Deletes an ABAP domain. ${deleted}`,
    );
  });

  it("check: the check's verdict, then each message", () => {
    const checked = `Whether the check ran and SAP's status text. ${MESSAGES}`;
    assert.equal(
      checkTool({ object: 'an ABAP class', tag: 'read-only' }),
      `[read-only] Checks the syntax of an ABAP class. ${checked}`,
    );
    assert.equal(
      checkTool({ object: 'a CDS view', how: 'or of its source as given' }),
      `Checks the syntax of a CDS view or of its source as given. ${checked}`,
    );
  });

  it("activate: the activation's verdict, then each message", () => {
    const activated = `Whether SAP activated it, whether SAP generated it and whether it was already active. ${MESSAGES}`;
    assert.equal(
      activateTool({ object: 'an ABAP class' }),
      `Activates an ABAP class. ${activated}`,
    );
    assert.equal(
      activateTool({ object: 'an ABAP table', tag: 'low-level' }),
      `[low-level] Activates an ABAP table. ${activated}`,
    );
  });

  it("validate: the verdict and SAP's message", () => {
    const validated =
      "Whether the name is admissible and SAP's message about it.";
    assert.equal(
      validateTool({ object: 'the name of a new ABAP class' }),
      `Validates the name of a new ABAP class. ${validated}`,
    );
    assert.equal(
      validateTool({ object: 'the name of a new service binding' }),
      `Validates the name of a new service binding. ${validated}`,
    );
  });

  it("a tool's own purpose replaces the kind's sentence; its facts stay the kind's", () => {
    assert.equal(
      deleteTool({
        purpose: purpose('Clears the local types of an ABAP class.'),
        result: results.WRITTEN_UNDER_LOCK,
      }),
      `Clears the local types of an ABAP class. ${UNDER_LOCK}`,
    );
  });

  it('every kind sentence and fact keeps the rules', () => {
    const shapes = [
      results.WRITTEN,
      results.WRITTEN_UNDER_LOCK,
      results.DELETED,
      results.CHECKED,
      results.ACTIVATED,
      results.VALIDATED,
      results.PUBLISHED,
    ];
    for (const shape of shapes) {
      for (const fact of resultReturns(shape)) {
        assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
      }
    }
    for (const fact of untypedReturns()) {
      assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
    }
    assert.deepStrictEqual(
      purposeFaults('Creates an ABAP class in a package.'),
      [],
    );
  });
});

describe('the facts of a typed result', () => {
  type Run = {
    readonly id: string;
    readonly state?: string;
    readonly alerts: readonly {
      readonly kind: string;
      readonly text: string;
    }[];
  };

  it('states its own members in one sentence, after `of`, then each list', () => {
    const shape = resultShape<Run>({
      id: 'the run id',
      state: 'its state',
      alerts: listOf('for each alert', { kind: 'its kind', text: 'its text' }),
    });
    assert.deepStrictEqual(
      resultReturns(shape).map((each) => each.text),
      ['The run id and its state.', 'For each alert: its kind and its text.'],
    );
    assert.deepStrictEqual(
      resultReturns(shape, 'the run:').map((each) => each.text),
      [
        'The run: the run id and its state.',
        'For each alert: its kind and its text.',
      ],
    );
  });

  it('refuses a member left out and a member invented, by type', () => {
    // @ts-expect-error — `state` is a member of `Run` and has no noun.
    resultShape<Run>({
      id: 'the run id',
      alerts: listOf('for each alert', { kind: 'its kind', text: 'its text' }),
    });
    resultShape<Run>({
      id: 'the run id',
      state: 'its state',
      alerts: listOf('for each alert', { kind: 'its kind', text: 'its text' }),
      // @ts-expect-error — `owner` is no member of `Run`.
      owner: 'its owner',
    });
    resultShape<Run>({
      id: 'the run id',
      state: 'its state',
      // @ts-expect-error — an alert's `text` has no noun.
      alerts: listOf('for each alert', { kind: 'its kind' }),
    });
  });
});
