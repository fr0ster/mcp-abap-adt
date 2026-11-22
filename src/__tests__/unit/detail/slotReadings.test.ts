/**
 * A slot whose answer only the document or the status of is read gets the
 * reading that parses nothing (terse answers, step 2): `verbatim` where the
 * handler reads `.raw` alone, `statusOnly` where it reads only that the call
 * succeeded. A `structured` parse there was work thrown away.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { statusOnly, verbatim } from '../../../lib/strategies/reading';
import {
  ourServiceBindingReads,
  ourServiceBindingWrites,
  ourUtils,
} from '../../../lib/strategies/resultSets';

it('the where-used scope is the document: modifyWhereUsedScope edits its text', () => {
  assert.equal(ourUtils.whereUsedScope, verbatim);
});

it("a service binding's types and service group are read as their documents", () => {
  assert.equal(ourServiceBindingReads.bindingTypes, verbatim);
  assert.equal(ourServiceBindingReads.odata, verbatim);
});

it("a create's service group read is a check: only its status is read", () => {
  assert.equal(ourServiceBindingWrites.odata, statusOnly);
});
