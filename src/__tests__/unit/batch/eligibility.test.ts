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

  it('HandlerUpdate needs lock_handle; DOMAIN/DATA_ELEMENT/PACKAGE need document', () => {
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
    // With properties under a lock they read, then write: two requests.
    for (const object_type of ['DOMAIN', 'DATA_ELEMENT', 'PACKAGE']) {
      expect(
        eligible(
          'HandlerUpdate',
          { object_type, description: 'x', lock_handle: LOCK },
          'http',
        ),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
    // The rule Task 11's entries take: `document` present beside the lock handle.
    const documentRule = [
      { argument: 'lock_handle', present: true },
      { argument: 'document', present: true },
      {
        argument: 'object_type',
        equals: ['DOMAIN', 'DATA_ELEMENT', 'PACKAGE'],
      },
    ];
    expect(
      whenHolds('HandlerUpdate', documentRule, {
        object_type: 'DOMAIN',
        lock_handle: LOCK,
        document: '<doc/>',
      }),
    ).toBe(true);
    expect(
      whenHolds('HandlerUpdate', documentRule, {
        object_type: 'DOMAIN',
        lock_handle: LOCK,
      }),
    ).toBe(false);
    // Presence, as handleHandlerUpdate routes it (`!== undefined`), not truthiness.
    const present = [{ argument: 'document', present: true }];
    for (const document of ['', 0, false]) {
      expect(whenHolds('HandlerUpdate', present, { document })).toBe(true);
    }
    expect(whenHolds('HandlerUpdate', present, {})).toBe(false);
  });

  it('HandlerCreate needs create_only true', () => {
    // Not listed until Task 10 adds its entries; the rule they take is
    // `create_only` equal to true, the boolean read as its word.
    expect(
      eligible(
        'HandlerCreate',
        { object_type: 'DOMAIN', create_only: true },
        'http',
      ),
    ).toEqual({ ok: false, reason: 'not-listed' });
    const createOnly = [{ argument: 'create_only', equals: ['true'] }];
    expect(whenHolds('HandlerCreate', createOnly, { create_only: true })).toBe(
      true,
    );
    expect(whenHolds('HandlerCreate', createOnly, { create_only: false })).toBe(
      false,
    );
    expect(whenHolds('HandlerCreate', createOnly, {})).toBe(false);
  });

  it('HandlerGet part contents and UNIT_TEST/CDS_UNIT_TEST are not eligible; absent part reads as source', () => {
    const pkg = { object_type: 'PACKAGE', package_name: 'PKG_A' };
    expect(eligible('HandlerGet', pkg, 'http')).toEqual({ ok: true });
    expect(eligible('HandlerGet', { ...pkg, part: 'source' }, 'http')).toEqual({
      ok: true,
    });
    expect(
      eligible('HandlerGet', { ...pkg, part: 'contents' }, 'http'),
    ).toEqual({ ok: false, reason: 'arguments' });
    for (const object_type of ['UNIT_TEST', 'CDS_UNIT_TEST']) {
      expect(
        eligible('HandlerGet', { object_type, run_id: 'RUN_A' }, 'http'),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
    // A metadata part that reads source and metadata — two requests.
    expect(
      eligible(
        'HandlerGet',
        { object_type: 'CLASS', part: 'metadata', class_name: 'CLAS_A' },
        'http',
      ),
    ).toEqual({ ok: false, reason: 'arguments' });
    // A package node's blank answer is checked with a second read.
    expect(
      eligible(
        'HandlerGet',
        { part: 'node_structure', object_adt_type: 'devc/k', object_name: 'P' },
        'http',
      ),
    ).toEqual({ ok: false, reason: 'arguments' });
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
          { object_type, description: 'x', lock_handle: LOCK },
          'http',
        ),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
    for (const object_type of ['unit_test', 'UNIT_TEST']) {
      expect(
        eligible('HandlerGet', { object_type, run_id: 'RUN_A' }, 'http'),
      ).toEqual({ ok: false, reason: 'arguments' });
    }
  });

  it('an unlisted tool is not eligible', () => {
    for (const tool of ['SearchSource', 'GetWhereUsed', 'DebugStep', 'Nope']) {
      expect(eligible(tool, {}, 'http')).toEqual({
        ok: false,
        reason: 'not-listed',
      });
    }
  });

  it('reads arguments that are not an object as absent', () => {
    expect(eligible('HandlerGet', undefined, 'http')).toEqual({
      ok: false,
      reason: 'arguments',
    });
    expect(eligible('SearchObject', null, 'http')).toEqual({ ok: true });
  });
});
