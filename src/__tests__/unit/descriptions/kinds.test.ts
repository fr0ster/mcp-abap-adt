/**
 * Plan step 10.6: the uniform tool kinds' descriptions (`kinds.ts`) — each
 * factory's sentence pinned for two tools of different object types (a
 * create, update or delete by the served tool's own description, its
 * purpose alone), and
 * the facts of a typed result (`resultShape`, `listOf`) generated from its
 * members' nouns, a member left out or invented refused by the compiler.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_DEFINITION as DELETE_CLASS } from '../../../handlers/class/high/handleDeleteClass';
import { TOOL_DEFINITION as CREATE_DATA_ELEMENT } from '../../../handlers/data_element/high/handleCreateDataElement';
import { TOOL_DEFINITION as CREATE_DOMAIN } from '../../../handlers/domain/high/handleCreateDomain';
import { TOOL_DEFINITION as UPDATE_DOMAIN } from '../../../handlers/domain/high/handleUpdateDomain';
import { TOOL_DEFINITION as UPDATE_TABLE_LOW } from '../../../handlers/table/low/handleUpdateTable';
import { TOOL_DEFINITION as DELETE_TABLE_TYPE } from '../../../handlers/table_type/high/handleDeleteTableType';
import {
  activateTool,
  checkTool,
  deleteTool,
  listOf,
  purpose,
  resultReturns,
  resultShape,
  results,
  untypedReturns,
  validateTool,
} from '../../../lib/description';
import { factFaults, purposeFaults } from './descriptionRules';

const MESSAGES =
  "For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.";

describe('the kind factories', () => {
  it('create: the object and what the tool writes for it, the transport last, no facts', () => {
    assert.equal(
      CREATE_DATA_ELEMENT.description,
      'Creates an ABAP data element in a package, typed by a domain, a built-in type or a reference, with its labels and search help, recorded in the transport given.',
    );
    assert.equal(
      CREATE_DOMAIN.description,
      'Creates an ABAP domain in a package, with its data type, length, decimals, conversion exit, value table and fixed values, recorded in the transport given.',
    );
  });

  it('update: what it changes of the object, no facts', () => {
    assert.equal(
      UPDATE_DOMAIN.description,
      'Updates the data type, length, decimals, conversion exit, value table and fixed values of an existing ABAP domain, replacing them whole.',
    );
    assert.equal(
      UPDATE_TABLE_LOW.description,
      '[low-level] Updates the DDL source of an existing ABAP database table, which defines its key, components and delivery class, under a lock the caller holds.',
    );
  });

  it('delete: the object, the transport last, no facts', () => {
    assert.equal(
      DELETE_CLASS.description,
      'Deletes an ABAP class, recorded in the transport given.',
    );
    assert.equal(
      DELETE_TABLE_TYPE.description,
      'Deletes an ABAP table type, recorded in the transport given.',
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

  it("a tool's own purpose replaces the kind's sentence", () => {
    assert.equal(
      deleteTool({
        purpose: purpose('Clears the local types of an ABAP class.'),
      }),
      'Clears the local types of an ABAP class.',
    );
  });

  it('every kind sentence and fact keeps the rules', () => {
    const shapes = [
      results.WRITTEN,
      results.CHECKED,
      results.ACTIVATED,
      results.VALIDATED,
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
