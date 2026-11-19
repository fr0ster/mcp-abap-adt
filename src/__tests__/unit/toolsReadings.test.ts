/**
 * What the developer tools under tools/ read, in plain code
 * (tools/readings.js): names, TODO lines, path lists, trace and dump ids,
 * and a profiler trace entry's user and title by field.
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../helpers/repoRoot';

const readings = require(
  path.join(repositoryRoot(__dirname), 'tools', 'readings.js'),
);

describe('tools/readings.js', () => {
  it('finds a TODO in any case, on every line it is asked about', () => {
    // A global pattern's `test` kept its position between lines: every second
    // TODO line was missed.
    const lines = ['// TODO: a', '// todo: b', '// @Todo c', '// done'];
    assert.deepStrictEqual(
      lines.map((line) => readings.hasTodo(line)),
      [true, true, true, false],
    );
  });

  it('reads an upper-case ABAP name and an ABAP user', () => {
    assert.equal(readings.isUpperAbapName('ZCL_X1'), true);
    assert.equal(readings.isUpperAbapName('1ZCL'), false);
    assert.equal(readings.isUpperAbapName('ZCL-X'), false);
    assert.equal(readings.isUpperAbapName(''), false);
    assert.equal(readings.isAbapUser('DEV.USER$-1'), true);
    assert.equal(readings.isAbapUser('dev'), false);
    assert.equal(readings.isAbapUser(''), false);
  });

  it('replaces a name as written, a dot included', () => {
    assert.equal(
      readings.replacedEverywhere('Z.A Z.A ZXA', 'Z.A', 'ZB'),
      'ZB ZB ZXA',
    );
    assert.equal(readings.asNameCharacters('A-B c'), 'A_B__');
    assert.equal(readings.collapseBlanks('a \n\t b'), 'a b');
  });

  it('splits a path list on ":" and ";", keeping an empty segment', () => {
    assert.deepStrictEqual(readings.splitPathList('/a::/b;/c'), [
      '/a',
      '',
      '/b',
      '/c',
    ]);
  });

  it('reads a trace id and every dump id', () => {
    const id = 'ABCDEF0123456789ABCDEF0123456789';
    assert.equal(
      readings.traceIdIn(`/SAP/bc/ADT/runtime/traces/abaptraces/${id}/x`),
      id,
    );
    assert.equal(
      readings.traceIdIn('/runtime/traces/abaptraces/XYZ'),
      undefined,
    );
    // A dotted capital I lower-cases to two code units: the id stays where it is.
    assert.equal(
      readings.traceIdIn(`\u0130 /runtime/traces/abaptraces/${id}`),
      id,
    );
    assert.equal(
      readings.traceIdIn(`/runtime/traces/abaptraces/${id.slice(1)}\u212A`),
      undefined,
    );
    assert.deepStrictEqual(
      readings.dumpIdsIn(
        'href="/sap/bc/adt/runtime/dumps/D1" /sap/bc/adt/runtime/dumps/D2?x /sap/bc/adt/runtime/dumps/ ',
      ),
      ['D1', 'D2'],
    );
  });

  it("reads a trace entry's user and title by field, not by its words", () => {
    const entry = {
      'atom:title': 'Run marker',
      'atom:author': { 'atom:name': 'other' },
      'trc:extendedData': { 'trc:user': 'dev_user' },
      'atom:summary': 'mentions SOMEONE and RUN MARKER',
    };
    assert.equal(readings.traceEntryUser(entry), 'DEV_USER');
    assert.equal(readings.traceEntryTitle(entry), 'RUN MARKER');
    assert.equal(
      readings.traceEntryUser({ 'atom:author': { 'atom:name': 'a' } }),
      'A',
    );
    assert.equal(readings.traceEntryUser({}), '');
  });
});
