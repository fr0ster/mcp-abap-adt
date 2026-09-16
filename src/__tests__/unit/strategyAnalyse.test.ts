import {
  analyseActivation,
  analyseCheck,
  analyseDeletion,
  analyseException,
  analyseUnitTest,
  analyseValidation,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtWireResponse } from '@mcp-abap-adt/interfaces';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces';
import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';

/**
 * The error axis, injected, against real documents.
 *
 * Three decisions per strategy, and each is tested: the library already called
 * it a failure and the document is used to enrich it; the library saw no
 * failure and the document says otherwise; neither, and the answer is a verdict
 * of "fine" rather than an absence.
 */

function wire(name: string): IAdtWireResponse {
  const meta = corpusSidecar(name);
  return {
    status: Number(meta.response.status),
    headers: meta.response.headers,
    data: corpusBody(name),
    config: { method: meta.request.method, url: meta.request.url },
  } as unknown as IAdtWireResponse;
}

describe('a refusal inside an HTTP 200 — what the design exists for', () => {
  it.each([
    ['refusal-activation-fails--01-activation', analyseActivation],
    ['refusal-delete-refused--01-deletion-delete', analyseDeletion],
    ['refusal-syntax-check--01-checkrun', analyseCheck],
    ['refusal-check-nonexistent-object--01-checkrun', analyseCheck],
    ['refusal-validation-name-taken-ddl--01-ddl-validation', analyseValidation],
  ] as const)('%s is a failure though the library saw none', (name, analyse) => {
    expect(corpusSidecar(name).response.status).toBe(200);

    const verdict = analyse(ADT_NO_FAILURE, wire(name));
    expect(verdict).not.toBe(ADT_NO_FAILURE);
    const failure = verdict as IAdtError & { messages: unknown[] };
    expect(failure.origin).toBe('refusal');
    expect(failure.message.length).toBeGreaterThan(0);
    expect(failure.messages.length).toBeGreaterThan(0);
  });
});

describe('a success stays a success', () => {
  it.each([
    ['activation-success-verdict--01-activation', analyseActivation],
    ['delete-success--01-deletion-delete', analyseDeletion],
    ['deletion-check-allows--01-deletion-check', analyseDeletion],
    ['check-success-verdict--01-checkrun', analyseCheck],
    ['validation-name-free-class--01-validation-objectname', analyseValidation],
    ['validation-name-free-ddl--01-ddl-validation', analyseValidation],
  ] as const)('%s answers ADT_NO_FAILURE', (name, analyse) => {
    expect(analyse(ADT_NO_FAILURE, wire(name))).toBe(ADT_NO_FAILURE);
  });

  it('a passing unit test run is not a failure', () => {
    const passing = corpusSidecar(
      'unittest-run-passing--03-results-fa53c505dd7b1fd1abb8599833a05d44',
    );
    expect(passing.response.status).toBe(200);
    expect(
      analyseUnitTest(
        ADT_NO_FAILURE,
        wire(
          'unittest-run-passing--03-results-fa53c505dd7b1fd1abb8599833a05d44',
        ),
      ),
    ).toBe(ADT_NO_FAILURE);
  });

  it('a failing one is', () => {
    const verdict = analyseUnitTest(
      ADT_NO_FAILURE,
      wire(
        'refusal-unittest-run-failing--03-results-fa53c505dd7b1fd1abb859f1193d5d44',
      ),
    );
    expect(verdict).not.toBe(ADT_NO_FAILURE);
    expect((verdict as IAdtError).message).toContain('deliberate failure');
  });
});

describe("the library's own verdict is enriched, never discarded", () => {
  const name = 'refusal-write-not-locked--01-update-source';

  it('keeps the message the library built', () => {
    const libraryVerdict: IAdtError = {
      origin: 'refusal',
      message: 'Request failed with status code 423',
    };
    const out = analyseException(libraryVerdict, wire(name)) as IAdtError & {
      messages: ReadonlyArray<{ t100?: { id: string; no: string } }>;
    };
    expect(out.message).toBe('Request failed with status code 423');
  });

  it('adds the identity the document carried and the library did not', () => {
    const out = analyseException(
      { origin: 'refusal', message: 'Request failed with status code 423' },
      wire(name),
    ) as IAdtError & {
      messages: ReadonlyArray<{ t100?: { id: string; no: string } }>;
    };
    expect(out.adtType).toBe('ExceptionResourceInvalidLockHandle');
    expect(out.namespace).toBe('com.sap.adt');
    expect(out.messages[0].t100).toMatchObject({
      id: 'SADT_RESOURCE',
      no: '026',
    });
  });

  it('still gives a message when there is no document to enrich from', () => {
    const out = analyseException(
      { origin: 'connection', message: 'JWT token has expired' },
      undefined,
    ) as IAdtError & { messages: Array<{ type: string; text: string }> };
    expect(out.origin).toBe('connection');
    expect(out.messages).toEqual([
      { type: 'E', text: 'JWT token has expired' },
    ]);
  });
});

describe('what a strategy never does', () => {
  it('never invents a connection failure out of a refusal', () => {
    const verdict = analyseActivation(
      ADT_NO_FAILURE,
      wire('refusal-activation-fails--01-activation'),
    ) as IAdtError;
    expect(verdict.origin).toBe('refusal');
  });

  it('copies method and url by name, never the transport config', () => {
    const verdict = analyseDeletion(ADT_NO_FAILURE, {
      status: 200,
      data: corpusBody('refusal-delete-refused--01-deletion-delete'),
      config: {
        method: 'POST',
        url: '/sap/bc/adt/deletion/delete',
        headers: { authorization: 'Bearer MUST-NOT-APPEAR' },
      },
    } as unknown as IAdtWireResponse) as IAdtError;
    expect(verdict.request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/deletion/delete',
    });
  });

  it('answers a token, not undefined, when there is no failure', () => {
    // "there is no strategy here" and "this is not a failure" must not be the
    // same value.
    const verdict = analyseCheck(
      ADT_NO_FAILURE,
      wire('check-success-verdict--01-checkrun'),
    );
    expect(verdict).toBe(ADT_NO_FAILURE);
    expect(verdict).not.toBeUndefined();
  });
});
