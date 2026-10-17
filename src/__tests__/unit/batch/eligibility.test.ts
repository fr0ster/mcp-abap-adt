/**
 * `eligible(tool, args, connection)`: what `tools/batch-handlers.json` admits
 * into a communication batch — a tool must be listed, an entry's `when` must
 * hold for the arguments, and its `connection` (when it names one) must be
 * the call's. Arguments are compared as the handlers read them: upper-cased,
 * an absent `part` of `HandlerGet` read as `source`.
 */

import { eligible, whenHolds } from '../../../lib/batch/eligibility';

const LOCK = 'LOCK_HANDLE_PLACEHOLDER';

describe('eligible', () => {
  it('a listed tool with no when is eligible', () => {
    expect(eligible('SearchObject', { object_name: 'Z*' }, 'http')).toEqual({
      ok: true,
    });
    expect(eligible('GetClass', { class_name: 'CLAS_A' }, 'rfc')).toEqual({
      ok: true,
    });
  });

  it('HandlerUpdate needs lock_handle; every type then sends its one write', () => {
    const write = { class_name: 'CLAS_A', source_code: 'x' };
    expect(
      eligible(
        'HandlerUpdate',
        { object_type: 'CLASS', ...write, lock_handle: LOCK },
        'http',
      ),
    ).toEqual({ ok: true });
    expect(
      eligible('HandlerUpdate', { object_type: 'CLASS', ...write }, 'http'),
    ).toEqual({ ok: false, reason: 'arguments' });
    // The metadata document is written as given: one PUT, no read first.
    for (const object_type of ['DOMAIN', 'DATA_ELEMENT', 'FUNCTION_GROUP']) {
      for (const connection of ['http', 'rfc'] as const) {
        expect(
          eligible(
            'HandlerUpdate',
            { object_type, source_code: '<doc/>', lock_handle: LOCK },
            connection,
          ),
        ).toEqual({ ok: true });
      }
    }
    // A package's lock over RFC is held in an ABAP session of its own.
    const pkg = {
      object_type: 'PACKAGE',
      source_code: '<doc/>',
      lock_handle: LOCK,
    };
    expect(eligible('HandlerUpdate', pkg, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerUpdate', pkg, 'rfc')).toEqual({
      ok: false,
      reason: 'connection',
    });
    // Presence, as the rule reads it (`!== undefined`), not truthiness.
    const present = [{ argument: 'lock_handle', present: true }];
    for (const lock_handle of ['', 0, false]) {
      expect(whenHolds('HandlerUpdate', present, { lock_handle })).toBe(true);
    }
    expect(whenHolds('HandlerUpdate', present, {})).toBe(false);
  });

  it('HandlerCreate is eligible per type, with no flag', () => {
    const domain = { object_type: 'DOMAIN', domain_name: 'DOM_A' };
    expect(eligible('HandlerCreate', domain, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerCreate', domain, 'rfc')).toEqual({ ok: true });
    // A type whose create is a chain is refused by the tool and not listed.
    for (const object_type of ['UNIT_TEST', 'CDS_UNIT_TEST']) {
      expect(eligible('HandlerCreate', { object_type }, 'http')).toEqual({
        ok: false,
        reason: 'arguments',
      });
    }
    // A package over RFC is created in an ABAP session of its own.
    const pkg = { object_type: 'PACKAGE' };
    expect(eligible('HandlerCreate', pkg, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerCreate', pkg, 'rfc')).toEqual({
      ok: false,
      reason: 'connection',
    });
  });

  it('HandlerGet part contents and UNIT_TEST/CDS_UNIT_TEST are not eligible; absent part reads as source', () => {
    const cls = { object_type: 'CLASS', class_name: 'CLAS_A' };
    expect(eligible('HandlerGet', cls, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerGet', { ...cls, part: 'source' }, 'http')).toEqual({
      ok: true,
    });
    const pkg = { object_type: 'PACKAGE', package_name: 'PKG_A' };
    expect(
      eligible('HandlerGet', { ...pkg, part: 'metadata' }, 'http'),
    ).toEqual({ ok: true });
    // A package has no source: the call is refused and sends nothing, so
    // nothing admits it — absent part included, read as source.
    for (const args of [pkg, { ...pkg, part: 'source' }]) {
      expect(eligible('HandlerGet', args, 'http')).toEqual({
        ok: false,
        reason: 'arguments',
      });
    }
    expect(
      eligible('HandlerGet', { ...pkg, part: 'contents' }, 'http'),
    ).toEqual({ ok: false, reason: 'arguments' });
    for (const object_type of ['UNIT_TEST', 'CDS_UNIT_TEST']) {
      expect(
        eligible('HandlerGet', { object_type, run_id: 'RUN_A' }, 'http'),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
    // Each part one request, a function module's at the group given: eligible.
    for (const part of ['source', 'metadata']) {
      expect(
        eligible(
          'HandlerGet',
          { object_type: 'CLASS', part, class_name: 'CLAS_A' },
          'http',
        ),
      ).toEqual({ ok: true });
      expect(
        eligible(
          'HandlerGet',
          {
            object_type: 'FUNCTION_MODULE',
            part,
            function_module_name: 'FM_A',
            function_group_name: 'FUGR_A',
          },
          'http',
        ),
      ).toEqual({ ok: true });
    }
    // A package node is one request too: its blank body is answered as it is.
    expect(
      eligible(
        'HandlerGet',
        { part: 'node_structure', object_adt_type: 'devc/k', object_name: 'P' },
        'http',
      ),
    ).toEqual({ ok: true });
    expect(
      eligible(
        'HandlerGet',
        {
          part: 'node_structure',
          object_adt_type: 'CLAS/OC',
          object_name: 'C',
        },
        'http',
      ),
    ).toEqual({ ok: true });
  });

  it('HandlerLock PACKAGE over rfc is not eligible', () => {
    const pkg = {
      object_type: 'PACKAGE',
      object_name: 'PKG_A',
      super_package: 'PKG_SUPER',
    };
    expect(eligible('HandlerLock', pkg, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerLock', pkg, 'rfc')).toEqual({
      ok: false,
      reason: 'connection',
    });
    expect(
      eligible(
        'HandlerUnlock',
        { object_type: 'PACKAGE', object_name: 'PKG_A', lock_handle: LOCK },
        'rfc',
      ),
    ).toEqual({ ok: false, reason: 'connection' });
    expect(
      eligible(
        'HandlerLock',
        { object_type: 'CLASS', object_name: 'CLAS_A' },
        'rfc',
      ),
    ).toEqual({ ok: true });
  });

  it("object_type 'domain' and 'DOMAIN' read the same", () => {
    for (const object_type of ['domain', 'DOMAIN', 'Domain']) {
      expect(
        eligible('HandlerLock', { object_type, object_name: 'DOM_A' }, 'http'),
      ).toEqual({ ok: true });
      expect(
        eligible(
          'HandlerUpdate',
          { object_type, source_code: '<doc/>', lock_handle: LOCK },
          'http',
        ),
      ).toEqual({ ok: true });
    }
    for (const object_type of ['unit_test', 'UNIT_TEST']) {
      expect(
        eligible('HandlerGet', { object_type, run_id: 'RUN_A' }, 'http'),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
  });

  it('an unlisted tool is not eligible', () => {
    for (const tool of ['SearchSource', 'RunATC', 'DebugStep', 'Nope']) {
      expect(eligible(tool, {}, 'http')).toEqual({
        ok: false,
        reason: 'not-listed',
      });
    }
  });

  it('the writes and runs are eligible only under the arguments whose requests do not chain', () => {
    const no = { ok: false, reason: 'arguments' };
    expect(eligible('ActivateClass', { class_name: 'C' }, 'rfc')).toEqual({
      ok: true,
    });
    expect(
      eligible(
        'HandlerActivate',
        { object_type: 'CLASS', object_name: 'C' },
        'http',
      ),
    ).toEqual({ ok: true });
    // An activation run polls its result; objects[] and object_adt_type take one.
    expect(
      eligible(
        'HandlerActivate',
        { objects: [{ name: 'C', type: 'CLAS/OC' }] },
        'http',
      ),
    ).toEqual(no);
    expect(
      eligible(
        'HandlerActivate',
        { object_type: 'CLASS', object_name: 'C', object_adt_type: 'CLAS/OC' },
        'http',
      ),
    ).toEqual(no);
    expect(
      eligible(
        'HandlerActivate',
        { object_type: 'PACKAGE', object_name: 'P' },
        'http',
      ),
    ).toEqual(no);
    expect(eligible('RuntimeRunClass', { class_name: 'C' }, 'http')).toEqual({
      ok: true,
    });
    expect(
      eligible('RuntimeRunClass', { class_name: 'C', profile: true }, 'http'),
    ).toEqual(no);
    expect(
      eligible(
        'HandlerProfileRun',
        { target_type: 'CLASS', class_name: 'C', profiling: false },
        'http',
      ),
    ).toEqual({ ok: true });
    expect(
      eligible(
        'HandlerProfileRun',
        { target_type: 'CLASS', class_name: 'C' },
        'http',
      ),
    ).toEqual(no);
    expect(
      eligible(
        'CreateFunctionGroup',
        { function_group_name: 'F', package_name: 'P' },
        'http',
      ),
    ).toEqual(no);
    expect(
      eligible(
        'CreateServiceDefinition',
        {
          service_definition_name: 'S',
          package_name: 'P',
          activate: false,
          source_code: 'x',
        },
        'http',
      ),
    ).toEqual(no);
    expect(eligible('RuntimeListFeeds', {}, 'http')).toEqual({ ok: true });
    expect(
      eligible('RuntimeListFeeds', { feed_type: 'dumps' }, 'http'),
    ).toEqual(no);
    expect(
      eligible(
        'GetWhereUsed',
        { object_name: 'C', object_type: 'class' },
        'http',
      ),
    ).toEqual({ ok: true });
    for (const filter of [
      { enable_all_types: true },
      { enable_only_types: ['CLAS/OC'] },
      { disable_types: ['PROG/P'] },
    ]) {
      expect(
        eligible(
          'GetWhereUsed',
          { object_name: 'C', object_type: 'class', ...filter },
          'http',
        ),
      ).toEqual(no);
    }
    expect(
      eligible(
        'CreatePackage',
        { package_name: 'P', super_package: 'S' },
        'rfc',
      ),
    ).toEqual({ ok: false, reason: 'connection' });
    expect(
      eligible(
        'HandlerGet',
        { part: 'node_structure', object_name: 'C' },
        'http',
      ),
    ).toEqual(no);
  });

  it('reads arguments that are not an object as absent', () => {
    expect(eligible('HandlerGet', undefined, 'http')).toEqual({
      ok: false,
      reason: 'arguments',
    });
    expect(eligible('SearchObject', null, 'http')).toEqual({ ok: true });
  });
});
