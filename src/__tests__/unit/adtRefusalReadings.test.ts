import * as fs from 'node:fs';
import * as path from 'node:path';
import { deletionRefusal } from '@mcp-abap-adt/adt-clients';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces';
import { ADT_CORPUS_DIR, corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  isIndeterminateWalkAnswer,
  readActivationRefusal,
  readAdtRefusal,
  readCheckRunRefusal,
  readDeletionRefusal,
  readExceptionRefusal,
  readUnitTestRefusal,
  readValidationRefusal,
} from '../../lib/adtRefusal';

/**
 * The four refusal readings, each against the corpus fixture that motivated it.
 *
 * Two halves, and the second is the one that matters: every refusal must be
 * recognised, and every SUCCESS must survive unrecognised. A reading that
 * cannot be fooled into calling a refusal a success is only half the contract —
 * one that calls a success a refusal breaks every caller instead.
 *
 * No network, no session. The fixtures are files.
 */

describe('form 1 — exc:exception', () => {
  it.each([
    ['refusal-object-not-found--01-read-source', 'ExceptionResourceNotFound'],
    [
      'refusal-package-not-found-tree--01-packages-zmcpbldnopkg9x',
      'ExceptionResourceNotFound',
    ],
    ['refusal-lock-held-by-other--01-lock', 'ExceptionResourceNoAccess'],
    [
      'refusal-write-not-locked--01-update-source',
      'ExceptionResourceInvalidLockHandle',
    ],
  ])('%s is read as a refusal carrying the server classification', (name, adtType) => {
    const refusal = readExceptionRefusal(corpusBody(name));
    expect(refusal).not.toBeNull();
    expect(refusal?.adtType).toBe(adtType);
    expect(refusal?.namespace).toBe('com.sap.adt');
    expect(refusal?.message.length).toBeGreaterThan(0);
  });

  it('keeps the message SAP wrote, including the user holding the lock', () => {
    const refusal = readExceptionRefusal(
      corpusBody('refusal-lock-held-by-other--01-lock'),
    );
    expect(refusal?.message).toContain('SAPUSER01');
    expect(refusal?.message).toContain('ZMCP_BLD_ANSCH01');
  });

  it('carries the T100 key on the message, code and placeholders included', () => {
    const refusal = readExceptionRefusal(
      corpusBody('refusal-object-not-found--01-read-source'),
    );
    const [first] = refusal?.messages ?? [];
    expect(first.t100).toEqual({
      id: 'SADT_RESOURCE',
      no: '002',
      values: ['CLASS', 'ZMCP_BLD_NOPE_CLS99'],
    });
    expect(first.code).toBe('ExceptionResourceNotFound');
  });

  it('does not fire on a document that is not an exception', () => {
    expect(
      readExceptionRefusal(
        corpusBody('activation-success-verdict--01-activation'),
      ),
    ).toBeNull();
    expect(readExceptionRefusal('')).toBeNull();
  });
});

describe('every refusal reduces to a severity and a sentence', () => {
  /**
   * The forms carry wildly different amounts, but each one that carries
   * anything at all carries those two. That reduction is what a strategy rests
   * on; everything else is enrichment that may be absent.
   *
   * Two forms state no severity and have one supplied: an exc:exception IS the
   * refusal, and a check that never ran says so in its status. A caller that
   * had to ask which carriers happened to include a severity would be back to
   * handling five shapes.
   */
  const refusals: Array<[string, string]> = [
    ['refusal-object-not-found--01-read-source', 'exception'],
    ['refusal-write-not-locked--01-update-source', 'exception'],
    ['refusal-lock-held-by-other--01-lock', 'exception'],
    ['refusal-activation-fails--01-activation', 'activation'],
    ['refusal-syntax-check--01-checkrun', 'checkrun'],
    ['refusal-check-nonexistent-object--01-checkrun', 'checkrun'],
    ['refusal-delete-refused--01-deletion-delete', 'deletion'],
    ['refusal-deletion-check-refuses--01-deletion-check', 'deletion'],
    ['refusal-validation-name-taken-ddl--01-ddl-validation', 'validation'],
    [
      'refusal-validation-name-taken-functiongroup--01-functions-validation',
      'validation',
    ],
  ];

  it.each(refusals)('%s gives at least one message', (name) => {
    const refusal = readAdtRefusal(corpusBody(name));
    expect(refusal).not.toBeNull();
    expect(refusal?.messages.length).toBeGreaterThan(0);
  });

  it.each(refusals)('%s states a severity and a non-empty sentence', (name) => {
    for (const m of readAdtRefusal(corpusBody(name))?.messages ?? []) {
      expect(['E', 'W', 'I', 'S']).toContain(m.type);
      expect(m.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('normalises the word ERROR to the letter E', () => {
    const refusal = readAdtRefusal(
      corpusBody('refusal-validation-name-taken-ddl--01-ddl-validation'),
    );
    expect(
      corpusBody('refusal-validation-name-taken-ddl--01-ddl-validation'),
    ).toContain('<SEVERITY>ERROR</SEVERITY>');
    expect(refusal?.messages[0].type).toBe('E');
  });

  it('supplies a severity where the document states none', () => {
    // An exc:exception has no severity field at all.
    const exception = corpusBody('refusal-object-not-found--01-read-source');
    expect(exception).not.toMatch(/type="[EWIS]"/);
    expect(readAdtRefusal(exception)?.messages[0].type).toBe('E');

    // A check that never ran carries no message list.
    const notProcessed = corpusBody(
      'refusal-check-nonexistent-object--01-checkrun',
    );
    expect(notProcessed).not.toContain('checkMessage');
    const messages = readAdtRefusal(notProcessed)?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('E');
    expect(messages[0].text).toContain('does not exist');
  });

  it('the identity is enrichment — present on one form, absent on the rest', () => {
    const withKey = readAdtRefusal(
      corpusBody('refusal-write-not-locked--01-update-source'),
    );
    expect(withKey?.messages[0].t100?.id).toBe('SADT_RESOURCE');

    const withoutKey = readAdtRefusal(
      corpusBody('refusal-delete-refused--01-deletion-delete'),
    );
    expect(withoutKey?.messages[0].t100).toBeUndefined();
    // and it still has the two things every form has
    expect(withoutKey?.messages[0].type).toBe('E');
    expect(withoutKey?.messages[0].text).toContain('already editing');
  });
});

describe('form 2a — activation', () => {
  it('a failed activation is a refusal', () => {
    const refusal = readActivationRefusal(
      corpusBody('refusal-activation-fails--01-activation'),
    );
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('STRONG_BUT_NOT_A_REAL_TYPE');
  });

  it('a successful activation is NOT a refusal', () => {
    expect(
      readActivationRefusal(
        corpusBody('activation-success-verdict--01-activation'),
      ),
    ).toBeNull();
  });

  it('every message reaches the caller, not only the errors', () => {
    const refusal = readActivationRefusal(
      corpusBody('refusal-activation-fails--01-activation'),
    );
    expect(refusal?.messages?.length).toBeGreaterThan(0);
    expect(refusal?.messages?.map((m) => m.type)).toContain('E');
  });

  it('activationExecuted="false" alone is a refusal, with no E message present', () => {
    // The hole in keying on a type E message alone: SAP declines and says
    // nothing. Not in the corpus, so it is constructed from the corpus shape.
    const declined =
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
      '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>' +
      '</chkl:messages>';
    const refusal = readActivationRefusal(declined);
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('activationExecuted="false"');
  });

  it('a warning on an activation that DID execute is not a refusal', () => {
    const warned = corpusBody(
      'activation-success-verdict--01-activation',
    ).replace(
      '/>',
      '/><msg objDescr="x" type="W" line="1"><shortText><txt>careful</txt></shortText></msg>',
    );
    expect(readActivationRefusal(warned)).toBeNull();
  });
});

describe('form 2b — deletion', () => {
  it('the refused delete is a refusal at both steps', () => {
    expect(
      readDeletionRefusal(
        corpusBody('refusal-deletion-check-refuses--01-deletion-check'),
      ),
    ).not.toBeNull();
    expect(
      readDeletionRefusal(
        corpusBody('refusal-delete-refused--01-deletion-delete'),
      ),
    ).not.toBeNull();
  });

  it('the refusal repeats what SAP said', () => {
    const refusal = readDeletionRefusal(
      corpusBody('refusal-delete-refused--01-deletion-delete'),
    );
    expect(refusal?.message).toContain('ZMCP_BLD_ANSCH01');
    expect(refusal?.message).toContain('already editing');
  });

  it('the successful delete is NOT a refusal at either step', () => {
    expect(
      readDeletionRefusal(
        corpusBody('deletion-check-allows--01-deletion-check'),
      ),
    ).toBeNull();
    expect(
      readDeletionRefusal(corpusBody('delete-success--01-deletion-delete')),
    ).toBeNull();
  });

  it('a del:message of type S on a success does not trip the reading', () => {
    // The regression this guards: keying on the presence of del:message rather
    // than on the attribute. delete-success--02 carries one.
    const document = corpusBody('delete-success--01-deletion-delete');
    expect(document).toContain('del:message');
    expect(document).toContain('del:type="S"');
    expect(readDeletionRefusal(document)).toBeNull();
  });

  it('the deletionResult is read by isDeleted, not by the check attribute', () => {
    const document = corpusBody('delete-success--01-deletion-delete');
    expect(document).not.toContain('isDeletable');
    // A reader that looked for isDeletable and defaulted a missing one to false
    // would call this refused. This is the adt-clients deletionRefusal hazard.
    expect(readDeletionRefusal(document)).toBeNull();
  });
});

describe("the hazard in adt-clients' own deletion parser, measured not assumed", () => {
  /**
   * `deletionRefusal` is shipped for the deletion CHECK step. Its
   * `parseDeletionCheck` looks for `isDeletable` with a regex and defaults a
   * missing one to false. A `deletionResult` has no such attribute.
   *
   * This was first written down as reasoning from their source. It is a test
   * now because reasoning is not measurement, and because the consequence —
   * wiring their strategy onto the delete step turns every successful delete
   * into a refusal — has to be true to be worth saying.
   */
  const refusedByTheirStrategy = (xml: string): boolean =>
    deletionRefusal(ADT_NO_FAILURE, { data: xml } as never) !== ADT_NO_FAILURE;

  it('reads the deletion CHECK correctly — that is what it is for', () => {
    expect(
      refusedByTheirStrategy(
        corpusBody('deletion-check-allows--01-deletion-check'),
      ),
    ).toBe(false);
    expect(
      refusedByTheirStrategy(
        corpusBody('refusal-deletion-check-refuses--01-deletion-check'),
      ),
    ).toBe(true);
  });

  it('calls a SUCCESSFUL delete refused when handed the deletionResult', () => {
    expect(
      refusedByTheirStrategy(corpusBody('delete-success--01-deletion-delete')),
    ).toBe(true);
  });

  it('our reading gets that same document right', () => {
    expect(
      readDeletionRefusal(corpusBody('delete-success--01-deletion-delete')),
    ).toBeNull();
  });
});

describe('form 3 — check runs', () => {
  it('a check that never ran is a refusal, and is given the message it lacks', () => {
    const document = corpusBody(
      'refusal-check-nonexistent-object--01-checkrun',
    );
    // The document itself has no message list — the reason is in an attribute.
    expect(document).not.toContain('checkMessage');

    const refusal = readCheckRunRefusal(document);
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('does not exist');
    // One is supplied, so this form reduces like the others.
    expect(refusal?.messages).toHaveLength(1);
    expect(refusal?.messages[0]).toMatchObject({
      type: 'E',
      code: 'notProcessed',
    });
  });

  it('a syntax error on a check that DID run is a refusal', () => {
    const refusal = readCheckRunRefusal(
      corpusBody('refusal-syntax-check--01-checkrun'),
    );
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('STRONG_BUT_NOT_A_REAL_TYPE');
  });

  it('a clean check is NOT a refusal', () => {
    expect(
      readCheckRunRefusal(corpusBody('check-success-verdict--01-checkrun')),
    ).toBeNull();
  });

  it('the status is read before the messages, or a missing object reads as clean', () => {
    // Stated as a test because it is the whole point of the ordering: the
    // notProcessed document has no checkMessageList to find an E in.
    const document = corpusBody(
      'refusal-check-nonexistent-object--01-checkrun',
    );
    expect(document).not.toContain('checkMessage');
    expect(readCheckRunRefusal(document)).not.toBeNull();
  });

  it('statusText echoed back as an E message does not make a passing check fail', () => {
    const echoed =
      '<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
      '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Object ZX has been checked">' +
      '<chkrun:checkMessageList><chkrun:checkMessage chkrun:type="E" chkrun:shortText="Object ZX has been checked"/>' +
      '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>';
    expect(readCheckRunRefusal(echoed)).toBeNull();
  });
});

describe('form 5 — validation asks whether the NAME is admissible', () => {
  /**
   * Validation is not a check run. It looks at a name, never at source, and
   * "already exists" is the only refusal it has been observed to give. The
   * element called CHECK_RESULT belongs to this document, not to /checkruns.
   */

  it('an admissible class name is not a refusal', () => {
    const document = corpusBody(
      'validation-name-free-class--01-validation-objectname',
    );
    expect(document).toContain('CHECK_RESULT');
    expect(readValidationRefusal(document)).toBeNull();
  });

  it('an admissible table name is not a refusal', () => {
    expect(
      readValidationRefusal(
        corpusBody('validation-name-free-table--01-tables-validation'),
      ),
    ).toBeNull();
  });

  it('an admissible DDL name answers SEVERITY OK, and is not a refusal', () => {
    const document = corpusBody('validation-name-free-ddl--01-ddl-validation');
    expect(document).toContain('<SEVERITY>OK</SEVERITY>');
    expect(readValidationRefusal(document)).toBeNull();
  });

  it('a taken DDL name is a refusal, inside HTTP 200', () => {
    const name = 'refusal-validation-name-taken-ddl--01-ddl-validation';
    expect(corpusSidecar(name).response.status).toBe(200);
    const refusal = readValidationRefusal(corpusBody(name));
    expect(refusal?.form).toBe('validation');
    expect(refusal?.message).toContain('already exists');
  });

  it('a taken function group name is a refusal, inside HTTP 200', () => {
    const name =
      'refusal-validation-name-taken-functiongroup--01-functions-validation';
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(readValidationRefusal(corpusBody(name))?.message).toContain(
      'already exists',
    );
  });

  it.each([
    [
      'refusal-validation-name-taken-class--01-validation-objectname',
      'InvalidClifName',
    ],
    [
      'refusal-validation-name-taken-domain--01-domains-validation',
      'InvalidObjName',
    ],
    [
      'refusal-validation-name-taken-table--01-tables-validation',
      'InvalidObjName',
    ],
  ])('%s refuses with the status instead, and is form 1', (name, adtType) => {
    expect(corpusSidecar(name).response.status).toBe(400);
    const refusal = readAdtRefusal(corpusBody(name));
    expect(refusal?.form).toBe('exception');
    expect(refusal?.adtType).toBe(adtType);
  });

  it('the presence of SEVERITY is not the signal — its value is', () => {
    const free = corpusBody('validation-name-free-ddl--01-ddl-validation');
    const taken = corpusBody(
      'refusal-validation-name-taken-ddl--01-ddl-validation',
    );
    expect(free).toContain('SEVERITY');
    expect(taken).toContain('SEVERITY');
    expect(readValidationRefusal(free)).toBeNull();
    expect(readValidationRefusal(taken)).not.toBeNull();
  });

  it('a check-run document is never read as a validation verdict', () => {
    expect(
      readValidationRefusal(corpusBody('refusal-syntax-check--01-checkrun')),
    ).toBeNull();
    expect(
      readValidationRefusal(corpusBody('check-success-verdict--01-checkrun')),
    ).toBeNull();
  });

  it('a validation document is never read as a check run', () => {
    expect(
      readCheckRunRefusal(
        corpusBody('refusal-validation-name-taken-ddl--01-ddl-validation'),
      ),
    ).toBeNull();
    expect(
      readCheckRunRefusal(
        corpusBody('validation-name-free-class--01-validation-objectname'),
      ),
    ).toBeNull();
  });
});

describe('form 6 — a unit test run, where only the third document tells you', () => {
  const RUN = 'unittest-run-passing--01-abapunit-runs';
  const STATUS =
    'unittest-run-passing--02-runs-fa53c505dd7b1fd1abb8599833a05d44';
  const PASSED =
    'unittest-run-passing--03-results-fa53c505dd7b1fd1abb8599833a05d44';
  const FAILED =
    'refusal-unittest-run-failing--03-results-fa53c505dd7b1fd1abb859f1193d5d44';

  it('the run itself answers 201 with nothing, and the id is in a header', () => {
    const s = corpusSidecar(RUN);
    expect(s.response.status).toBe(201);
    expect(corpusBody(RUN)).toBe('');
    expect(s.response.headers.location).toMatch(/abapunit\/runs\//);
  });

  it('the status document is the same whether the run passed or failed', () => {
    // It reports progress, not verdict. Reading pass/fail from it would call
    // every completed run a success.
    const statusBody = corpusBody(STATUS);
    expect(statusBody).toContain('status="FINISHED"');
    expect(statusBody).not.toContain('alert');
    expect(readAdtRefusal(statusBody)).toBeNull();
  });

  it('a passing result is not a refusal', () => {
    expect(corpusBody(PASSED)).not.toContain('<alerts>');
    expect(readUnitTestRefusal(corpusBody(PASSED))).toBeNull();
  });

  it('a failing result is, and reduces to the same severity and sentence', () => {
    const refusal = readUnitTestRefusal(corpusBody(FAILED));
    expect(refusal?.form).toBe('unittest');
    expect(refusal?.messages).toHaveLength(1);
    expect(refusal?.messages[0].type).toBe('E');
    expect(refusal?.messages[0].text).toContain('deliberate failure');
    expect(refusal?.messages[0].code).toBe('failedAssertion');
  });

  it("maps ABAP Unit's own severity scale onto the usual letters", () => {
    expect(corpusBody(FAILED)).toContain('severity="critical"');
    expect(readUnitTestRefusal(corpusBody(FAILED))?.messages[0].type).toBe('E');
  });
});

describe('form 4 — the walkers, where no reading is possible', () => {
  const missing = 'refusal-package-not-found-contents-empty--01-nodestructure';
  const empty = 'read-empty-package-contents--01-nodestructure';

  it('a missing package and an empty package are the same bytes', () => {
    expect(corpusBody(empty)).toBe(corpusBody(missing));
  });

  it('both are indeterminate, and no reading claims otherwise', () => {
    expect(isIndeterminateWalkAnswer(corpusBody(missing))).toBe(true);
    expect(isIndeterminateWalkAnswer(corpusBody(empty))).toBe(true);
    expect(readAdtRefusal(corpusBody(missing))).toBeNull();
  });

  it('a populated package is not indeterminate', () => {
    expect(
      isIndeterminateWalkAnswer(
        corpusBody('read-package-contents-structure--01-nodestructure'),
      ),
    ).toBe(false);
  });
});

describe('the dispatcher picks the right reading for each document', () => {
  it.each([
    ['refusal-object-not-found--01-read-source', 'exception'],
    ['refusal-activation-fails--01-activation', 'activation'],
    ['refusal-delete-refused--01-deletion-delete', 'deletion'],
    ['refusal-syntax-check--01-checkrun', 'checkrun'],
  ])('%s is read as form %s', (name, form) => {
    expect(readAdtRefusal(corpusBody(name))?.form).toBe(form);
  });

  it.each([
    'activation-success-verdict--01-activation',
    'check-success-verdict--01-checkrun',
    'deletion-check-allows--01-deletion-check',
    'delete-success--01-deletion-delete',
    'lock-success--01-lock',
    'read-class-source-text--01-read-source',
    'read-package-contents-structure--01-nodestructure',
    'read-where-used-list-structure--01-informationsystem-usagereferences',
    'read-transport-list-structure--01-cts-transportrequests',
    'read-table-metadata-structure--01-tables-zmcpshrrtabl',
  ])('%s is not read as a refusal by any of the four', (name) => {
    expect(readAdtRefusal(corpusBody(name))).toBeNull();
  });
});
