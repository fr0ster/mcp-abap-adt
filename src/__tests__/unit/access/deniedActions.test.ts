/**
 * The deny grammar (spec §2.1): each form read into its entry, and every
 * malformed form refused with a `ParameterRefusal` naming the row's form.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { ParameterRefusal } from '../../../lib/config/authParameters';

const ROW = 'deny-actions';

describe('parseDeniedEntry', () => {
  it('reads a tool', () => {
    assert.deepEqual(parseDeniedEntry('DeleteClass', ROW), {
      text: 'DeleteClass',
      tool: 'DeleteClass',
      toolIsPrefix: false,
      value: undefined,
      valueIsPrefix: false,
    });
  });

  it('reads a tool value', () => {
    const entry = parseDeniedEntry('HandlerDelete.CLASS', ROW);
    assert.equal(entry.tool, 'HandlerDelete');
    assert.equal(entry.value, 'CLASS');
    assert.equal(entry.valueIsPrefix, false);
  });

  it('reads an ADT type code as a value, its "/" included', () => {
    for (const text of [
      'HandlerActivate.CLAS/OC',
      'HandlerGet.DDLS/DF',
      'HandlerActivate.ENHO/XHH',
    ]) {
      const entry = parseDeniedEntry(text, ROW);
      assert.equal(entry.value, text.slice(text.indexOf('.') + 1));
    }
  });

  it('reads a value prefix', () => {
    const entry = parseDeniedEntry('HandlerDebugSession.get*', ROW);
    assert.equal(entry.tool, 'HandlerDebugSession');
    assert.equal(entry.value, 'get');
    assert.equal(entry.valueIsPrefix, true);
  });

  it('reads a tool prefix', () => {
    const entry = parseDeniedEntry('Delete*', ROW);
    assert.equal(entry.tool, 'Delete');
    assert.equal(entry.toolIsPrefix, true);
    assert.equal(entry.value, undefined);
  });

  for (const text of [
    '',
    '.CLASS',
    'Handler-Get',
    'HandlerGet.CL ASS',
    'Del*ete',
    '*',
    '*.CLASS',
    'Delete*.CLASS',
    'A.B.C',
    'HandlerGet.',
    'HandlerGet.CL*SS',
  ]) {
    it(`refuses "${text}", naming the form`, () => {
      assert.throws(
        () => parseDeniedEntry(text, ROW),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words.startsWith(`Invalid ${ROW} entry "${text}": `),
      );
    });
  }
});
