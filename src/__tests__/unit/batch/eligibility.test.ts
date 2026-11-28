/**
 * `eligible(tool, args, connection, 'compact')`: what `tools/batch-handlers.json` admits
 * into a communication batch — a tool must be listed, an entry's `when` must
 * hold for the arguments, and its `connection` (when it names one) must be
 * the call's. Arguments are compared as the handlers read them: upper-cased,
 * an absent `part` of `HandlerGet` read as `source`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  COMPACT_ACTIVATE,
  PROJECTION_VARIANTS,
} from '../../../lib/adtProjections';
import {
  absentReadsAs,
  admits,
  type BatchEntry,
  batchEntryOf,
  eligible,
  whenHolds,
} from '../../../lib/batch/eligibility';

const LOCK = 'LOCK_HANDLE_PLACEHOLDER';

describe('eligible', () => {
  it('a listed tool with no when is eligible', () => {
    assert.deepStrictEqual(
      eligible('HandlerProfileList', {}, 'rfc', 'compact'),
      {
        ok: true,
      },
    );
  });

  it("a full-set tool is not listed: batch mode is the compact sets'", () => {
    for (const tool of [
      'SearchObject',
      'GetClass',
      'ActivateClass',
      'RuntimeRunClass',
      'CreateFunctionGroup',
      'CreatePackage',
      'RuntimeListFeeds',
      'GetWhereUsed',
      'GetObjectVersions',
      'GetFunctionModule',
    ]) {
      assert.deepStrictEqual(
        { tool, eligible: eligible(tool, {}, 'http', 'compact') },
        {
          tool,
          eligible: { ok: false, reason: 'not-listed' },
        },
      );
    }
  });

  it('HandlerUpdate needs lock_handle; every type then sends its one write', () => {
    const write = { class_name: 'CLAS_A', source_code: 'x' };
    assert.deepStrictEqual(
      eligible(
        'HandlerUpdate',
        { object_type: 'CLASS', ...write, lock_handle: LOCK },
        'http',
        'compact',
      ),
      { ok: true },
    );
    assert.deepStrictEqual(
      eligible(
        'HandlerUpdate',
        { object_type: 'CLASS', ...write },
        'http',
        'compact',
      ),
      { ok: false, reason: 'arguments' },
    );
    // The metadata document is written as given: one PUT, no read first.
    for (const object_type of ['DOMAIN', 'DATA_ELEMENT', 'FUNCTION_GROUP']) {
      for (const connection of ['http', 'rfc'] as const) {
        assert.deepStrictEqual(
          eligible(
            'HandlerUpdate',
            { object_type, source_code: '<doc/>', lock_handle: LOCK },
            connection,
            'compact',
          ),
          { ok: true },
        );
      }
    }
    // A package's lock over RFC is held in an ABAP session of its own.
    const pkg = {
      object_type: 'PACKAGE',
      source_code: '<doc/>',
      lock_handle: LOCK,
    };
    assert.deepStrictEqual(eligible('HandlerUpdate', pkg, 'http', 'compact'), {
      ok: true,
    });
    assert.deepStrictEqual(eligible('HandlerUpdate', pkg, 'rfc', 'compact'), {
      ok: false,
      reason: 'connection',
    });
    // Presence, as the rule reads it (`!== undefined`), not truthiness.
    const present = [{ argument: 'lock_handle', present: true }];
    for (const lock_handle of ['', 0, false]) {
      assert.equal(whenHolds('HandlerUpdate', present, { lock_handle }), true);
    }
    assert.equal(whenHolds('HandlerUpdate', present, {}), false);
  });

  it('HandlerCreate is eligible per type, with no flag', () => {
    const domain = { object_type: 'DOMAIN', domain_name: 'DOM_A' };
    assert.deepStrictEqual(
      eligible('HandlerCreate', domain, 'http', 'compact'),
      {
        ok: true,
      },
    );
    assert.deepStrictEqual(
      eligible('HandlerCreate', domain, 'rfc', 'compact'),
      {
        ok: true,
      },
    );
    // A type whose create is a chain is refused by the tool and not listed.
    for (const object_type of ['UNIT_TEST', 'CDS_UNIT_TEST']) {
      assert.deepStrictEqual(
        eligible('HandlerCreate', { object_type }, 'http', 'compact'),
        {
          ok: false,
          reason: 'arguments',
        },
      );
    }
    // A transport request's task is typed from the create's answer.
    assert.deepStrictEqual(
      eligible(
        'HandlerCreate',
        { object_type: 'TRANSPORT' },
        'http',
        'compact',
      ),
      { ok: false, reason: 'arguments' },
    );
    // A package over RFC is created in an ABAP session of its own.
    const pkg = { object_type: 'PACKAGE' };
    assert.deepStrictEqual(eligible('HandlerCreate', pkg, 'http', 'compact'), {
      ok: true,
    });
    assert.deepStrictEqual(eligible('HandlerCreate', pkg, 'rfc', 'compact'), {
      ok: false,
      reason: 'connection',
    });
  });

  it('HandlerGet part contents is not eligible, UNIT_TEST/CDS_UNIT_TEST with run_id are; absent part reads as source', () => {
    const cls = { object_type: 'CLASS', class_name: 'CLAS_A' };
    assert.deepStrictEqual(eligible('HandlerGet', cls, 'http', 'compact'), {
      ok: true,
    });
    assert.deepStrictEqual(
      eligible('HandlerGet', { ...cls, part: 'source' }, 'http', 'compact'),
      {
        ok: true,
      },
    );
    const pkg = { object_type: 'PACKAGE', package_name: 'PKG_A' };
    assert.deepStrictEqual(
      eligible('HandlerGet', { ...pkg, part: 'metadata' }, 'http', 'compact'),
      { ok: true },
    );
    // A package has no source: the call is refused and sends nothing, so
    // nothing admits it — absent part included, read as source.
    for (const args of [pkg, { ...pkg, part: 'source' }]) {
      assert.deepStrictEqual(eligible('HandlerGet', args, 'http', 'compact'), {
        ok: false,
        reason: 'arguments',
      });
    }
    assert.deepStrictEqual(
      eligible('HandlerGet', { ...pkg, part: 'contents' }, 'http', 'compact'),
      { ok: false, reason: 'arguments' },
    );
    // A unit-test run's result: one request, with its run_id.
    for (const object_type of ['UNIT_TEST', 'CDS_UNIT_TEST']) {
      assert.deepStrictEqual(
        eligible(
          'HandlerGet',
          { object_type, run_id: 'RUN_A' },
          'http',
          'compact',
        ),
        { ok: true },
      );
      assert.deepStrictEqual(
        eligible('HandlerGet', { object_type }, 'http', 'compact'),
        {
          ok: false,
          reason: 'arguments',
        },
      );
      assert.deepStrictEqual(
        eligible(
          'HandlerGet',
          { object_type, part: 'metadata', run_id: 'RUN_A' },
          'http',
          'compact',
        ),
        { ok: false, reason: 'arguments' },
      );
    }
    for (const tool of ['HandlerUnitTestResult', 'HandlerCdsUnitTestResult']) {
      assert.deepStrictEqual(
        eligible(tool, { run_id: 'RUN_A' }, 'http', 'compact'),
        {
          ok: true,
        },
      );
      assert.deepStrictEqual(eligible(tool, {}, 'http', 'compact'), {
        ok: false,
        reason: 'arguments',
      });
    }
    // Each part one request, a function module's at the group given: eligible.
    for (const part of ['source', 'metadata']) {
      assert.deepStrictEqual(
        eligible(
          'HandlerGet',
          { object_type: 'CLASS', part, class_name: 'CLAS_A' },
          'http',
          'compact',
        ),
        { ok: true },
      );
    }
    // A function module's source is read after its metadata names the group
    // given (#2): two requests, the second after the first answer. Its
    // metadata is the one request, checked locally.
    const module = (part: string) =>
      eligible(
        'HandlerGet',
        {
          object_type: 'FUNCTION_MODULE',
          part,
          function_module_name: 'FM_A',
          function_group_name: 'FUGR_A',
        },
        'http',
        'compact',
      );
    assert.deepStrictEqual(
      [module('source'), module('metadata')],
      [{ ok: false, reason: 'arguments' }, { ok: true }],
    );
    // A package node is one request too: its blank body is answered as it is.
    assert.deepStrictEqual(
      eligible(
        'HandlerGet',
        { part: 'node_structure', object_adt_type: 'devc/k', object_name: 'P' },
        'http',
        'compact',
      ),
      { ok: true },
    );
    assert.deepStrictEqual(
      eligible(
        'HandlerGet',
        {
          part: 'node_structure',
          object_adt_type: 'CLAS/OC',
          object_name: 'C',
        },
        'http',
        'compact',
      ),
      { ok: true },
    );
  });

  it('HandlerLock PACKAGE over rfc is not eligible', () => {
    const pkg = {
      object_type: 'PACKAGE',
      object_name: 'PKG_A',
      super_package: 'PKG_SUPER',
    };
    assert.deepStrictEqual(eligible('HandlerLock', pkg, 'http', 'compact'), {
      ok: true,
    });
    assert.deepStrictEqual(eligible('HandlerLock', pkg, 'rfc', 'compact'), {
      ok: false,
      reason: 'connection',
    });
    assert.deepStrictEqual(
      eligible(
        'HandlerLock',
        {
          action: 'unlock',
          object_type: 'PACKAGE',
          object_name: 'PKG_A',
          lock_handle: LOCK,
        },
        'rfc',
        'compact',
      ),
      { ok: false, reason: 'connection' },
    );
    assert.deepStrictEqual(
      eligible(
        'HandlerLock',
        { object_type: 'CLASS', object_name: 'CLAS_A' },
        'rfc',
        'compact',
      ),
      { ok: true },
    );
  });

  it("object_type 'domain' and 'DOMAIN' read the same", () => {
    for (const object_type of ['domain', 'DOMAIN', 'Domain']) {
      assert.deepStrictEqual(
        eligible(
          'HandlerLock',
          { object_type, object_name: 'DOM_A' },
          'http',
          'compact',
        ),
        { ok: true },
      );
      assert.deepStrictEqual(
        eligible(
          'HandlerUpdate',
          { object_type, source_code: '<doc/>', lock_handle: LOCK },
          'http',
          'compact',
        ),
        { ok: true },
      );
    }
    for (const object_type of ['unit_test', 'UNIT_TEST']) {
      assert.deepStrictEqual(
        eligible(
          'HandlerGet',
          { object_type, run_id: 'RUN_A' },
          'http',
          'compact',
        ),
        { ok: true },
      );
    }
  });

  it("the transport creates are not listed: each types its task from the create's answer", () => {
    for (const tool of [
      'CreateTransport',
      'HandlerTransportCreate',
      'CreateTransportTask',
    ]) {
      assert.deepStrictEqual(
        { tool, eligible: eligible(tool, {}, 'http', 'compact') },
        {
          tool,
          eligible: { ok: false, reason: 'not-listed' },
        },
      );
    }
  });

  it('an unlisted tool is not eligible', () => {
    for (const tool of ['SearchSource', 'RunATC', 'DebugStep', 'Nope']) {
      assert.deepStrictEqual(eligible(tool, {}, 'http', 'compact'), {
        ok: false,
        reason: 'not-listed',
      });
    }
  });

  /**
   * Every member HandlerActivate activates (`COMPACT_ACTIVATE`, each
   * variant) sends one request: its type's own activation, or one activation
   * run — a function module's under its group, named GROUP|MODULE. Each is
   * listed, so a member the activate routes gain cannot be left out.
   */
  it('every member HandlerActivate activates is eligible but a function module, on each variant', () => {
    for (const variant of PROJECTION_VARIANTS) {
      for (const member of COMPACT_ACTIVATE[variant]) {
        const object_name = member === 'FUNCTION_MODULE' ? 'G|M' : 'O';
        // A function module's group is checked before the run (#2): its
        // metadata read is answered before the activation is sent.
        const recorded =
          member === 'FUNCTION_MODULE'
            ? { ok: false, reason: 'arguments' }
            : { ok: true };
        assert.deepStrictEqual(
          {
            variant,
            member,
            eligible: eligible(
              'HandlerActivate',
              { object_type: member, object_name },
              'http',
              'compact',
            ),
          },
          { variant, member, eligible: recorded },
        );
      }
    }
  });

  it('the writes and runs are eligible only under the arguments whose requests do not chain', () => {
    const no = { ok: false, reason: 'arguments' };
    assert.deepStrictEqual(
      eligible(
        'HandlerActivate',
        { object_type: 'CLASS', object_name: 'C' },
        'http',
        'compact',
      ),
      { ok: true },
    );
    // An activation run is its one POST, answered { run_id }; objects[],
    // object_adt_type and the unmapped single types start one.
    for (const args of [
      { objects: [{ name: 'C', type: 'CLAS/OC' }] },
      { object_type: 'CLASS', object_name: 'C', object_adt_type: 'CLAS/OC' },
      { object_type: 'PACKAGE', object_name: 'P' },
    ]) {
      assert.deepStrictEqual(
        eligible('HandlerActivate', args, 'http', 'compact'),
        {
          ok: true,
        },
      );
    }
    // The activation run's reads, by run_id.
    for (const part of ['activation_status', 'activation_results']) {
      assert.deepStrictEqual(
        eligible('HandlerGet', { part, run_id: 'R' }, 'http', 'compact'),
        {
          ok: true,
        },
      );
      assert.deepStrictEqual(
        eligible('HandlerGet', { part }, 'http', 'compact'),
        no,
      );
    }
    assert.deepStrictEqual(
      eligible(
        'HandlerProfileRun',
        { target_type: 'CLASS', class_name: 'C', profiler_id: 'P' },
        'http',
        'compact',
      ),
      { ok: true },
    );
    assert.deepStrictEqual(
      eligible(
        'HandlerProfileRun',
        { target_type: 'CLASS', class_name: 'C' },
        'http',
        'compact',
      ),
      { ok: true },
    );
    assert.deepStrictEqual(
      eligible('HandlerProfileSchedule', {}, 'http', 'compact'),
      {
        ok: true,
      },
    );
    // A package create over RFC opens an ABAP session of its own.
    assert.deepStrictEqual(
      eligible(
        'HandlerCreate',
        { object_type: 'PACKAGE', package_name: 'P', super_package: 'S' },
        'rfc',
        'compact',
      ),
      { ok: false, reason: 'connection' },
    );
    assert.deepStrictEqual(
      eligible(
        'HandlerGet',
        { part: 'node_structure', object_name: 'C' },
        'http',
        'compact',
      ),
      no,
    );
  });

  it('a function module addressed through its group is not recorded: its metadata is read first (#2)', () => {
    const no = { ok: false, reason: 'arguments' };
    const listed = (type: string) =>
      eligible(
        'HandlerActivate',
        {
          objects: [
            { name: 'DDL_A', type: 'DDLS/DF' },
            { name: 'FM_A', type, parentName: 'FUGR_A' },
          ],
        },
        'http',
        'compact',
      );
    assert.deepStrictEqual(
      {
        'objects FUGR/FF': listed('FUGR/FF'),
        'objects fugr/ff': listed('fugr/ff'),
        'objects function_module': listed('function_module'),
        'objects without a module': listed('BDEF/BDO'),
        'object_adt_type FUGR/FF': eligible(
          'HandlerActivate',
          { object_name: 'FM_A', object_adt_type: 'FUGR/FF', parentName: 'G' },
          'http',
          'compact',
        ),
        'HandlerSystem where_used functionmodule': eligible(
          'HandlerSystem',
          {
            action: 'where_used',
            object_name: 'G|M',
            object_type: 'functionmodule',
          },
          'http',
          'compact',
        ),
        'HandlerCheckRun FUNCTION_MODULE': eligible(
          'HandlerCheckRun',
          { object_name: 'G|M', object_type: 'FUNCTION_MODULE' },
          'http',
          'compact',
        ),
        'HandlerDeletionCheck FUNCTION_MODULE': eligible(
          'HandlerDeletionCheck',
          { object_name: 'G|M', object_type: 'FUNCTION_MODULE' },
          'http',
          'compact',
        ),
      },
      {
        'objects FUGR/FF': no,
        'objects fugr/ff': no,
        'objects function_module': no,
        'objects without a module': { ok: true },
        'object_adt_type FUGR/FF': no,
        'HandlerSystem where_used functionmodule': no,
        'HandlerCheckRun FUNCTION_MODULE': no,
        'HandlerDeletionCheck FUNCTION_MODULE': no,
      },
    );
  });

  it('HandlerSystem is eligible by its action: the reads whose requests do not chain', () => {
    const no = { ok: false, reason: 'arguments' };
    const system = (args: Record<string, unknown>) =>
      eligible('HandlerSystem', args, 'http', 'compact');
    assert.deepStrictEqual(
      {
        search_object: system({ action: 'search_object', object_name: 'Z*' }),
        where_used: system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
        }),
        'where_used enable_all_types false': system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
          enable_all_types: false,
        }),
        atc_findings: system({ action: 'atc_findings', worklist_id: 'W' }),
        atc_results: system({ action: 'atc_results', created_by: '*' }),
        atc_result: system({ action: 'atc_result', display_id: 'D' }),
        search_source: system({
          action: 'search_source',
          query: 'q',
          packages: ['Z'],
        }),
        package_tree: system({ action: 'package_tree', package_name: 'Z' }),
        transports: system({ action: 'transports' }),
        'no action': system({ object_name: 'Z*' }),
        'where_used objects': system({
          action: 'where_used',
          objects: [{ object_name: 'CLAS_A', object_type: 'class' }],
        }),
        'where_used enable_all_types': system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
          enable_all_types: true,
        }),
        'where_used enable_only_types': system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
          enable_only_types: ['CLAS/OC'],
        }),
        'where_used disable_types': system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
          disable_types: ['CLAS/OC'],
        }),
        'where_used in_object': system({
          action: 'where_used',
          object_name: 'CLAS_A',
          object_type: 'class',
          in_object: { object_type: 'CLAS/OC', object_name: 'ZCL_B' },
        }),
      },
      {
        search_object: { ok: true },
        where_used: { ok: true },
        'where_used enable_all_types false': { ok: true },
        atc_findings: { ok: true },
        atc_results: { ok: true },
        atc_result: { ok: true },
        search_source: no,
        package_tree: no,
        transports: no,
        'no action': no,
        'where_used objects': no,
        'where_used enable_all_types': no,
        'where_used enable_only_types': no,
        'where_used disable_types': no,
        // Its code lines are read with the identifiers of its first answer.
        'where_used in_object': no,
      },
    );
  });

  for (const object_type of [
    'FUGR/FF',
    'fugr/ff',
    'function',
    'functionmodule',
    'function_module',
    'func',
    'FUNC',
  ]) {
    it(
      format(
        'HandlerSystem where_used of a function module (%s) is not recorded: its group is read first (#2)',
        object_type,
      ),
      () => {
        assert.deepStrictEqual(
          eligible(
            'HandlerSystem',
            { action: 'where_used', object_name: 'G|M', object_type },
            'http',
            'compact',
          ),
          { ok: false, reason: 'arguments' },
        );
      },
    );
  }

  it('an empty objects list is the single form, as HandlerActivate dispatches it: a function module there is not recorded (#2)', () => {
    const no = { ok: false, reason: 'arguments' };
    assert.deepStrictEqual(
      {
        single: eligible(
          'HandlerActivate',
          { objects: [], object_type: 'FUNCTION_MODULE', object_name: 'G|M' },
          'http',
          'compact',
        ),
        code: eligible(
          'HandlerActivate',
          {
            objects: [],
            object_name: 'M',
            object_adt_type: 'FUGR/FF',
            parentName: 'G',
          },
          'http',
          'compact',
        ),
        class: eligible(
          'HandlerActivate',
          { objects: [], object_type: 'CLASS', object_name: 'ZCL_A' },
          'http',
          'compact',
        ),
      },
      { single: no, code: no, class: { ok: true } },
    );
  });
});

describe('eligible by set', () => {
  it('a compact entry admits no core call', () => {
    assert.deepStrictEqual(eligible('HandlerProfileList', {}, 'rfc', 'core'), {
      ok: false,
      reason: 'not-listed',
    });
    assert.deepStrictEqual(
      eligible(
        'HandlerGet',
        { object_type: 'CLASS', object_name: 'CLAS_A' },
        'http',
        'core',
      ),
      { ok: false, reason: 'not-listed' },
    );
  });

  it('a core entry admits no compact call, and a compact one no core call', () => {
    const core: BatchEntry = {
      tool: 'GetClass',
      set: 'core',
      handler: 'src/handlers/class/high/handleGetClass.ts#handleGetClass',
      sends: 'one request: GET the part asked',
    };
    assert.deepStrictEqual(admits([core], 'GetClass', {}, 'http'), {
      ok: true,
    });
    assert.deepStrictEqual(admits([], 'GetClass', {}, 'http'), {
      ok: false,
      reason: 'not-listed',
    });
  });

  it('the loader reads a core row and refuses any other set', () => {
    const row = {
      tool: 'GetClass',
      handler: 'src/handlers/class/high/handleGetClass.ts#handleGetClass',
      sends: 'one request: GET the part asked',
    };
    assert.equal(batchEntryOf({ ...row, set: 'core' }, 0).set, 'core');
    assert.equal(batchEntryOf({ ...row, set: 'compact' }, 0).set, 'compact');
    assert.throws(
      () => batchEntryOf({ ...row, set: 'full' }, 3),
      /row 3 is malformed/,
    );
  });

  it('an absent part of GetFunctionModule reads as source', () => {
    assert.equal(absentReadsAs('GetFunctionModule', 'part'), 'source');
  });
});
