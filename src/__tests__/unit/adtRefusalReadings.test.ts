import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isIndeterminateWalkAnswer,
  readActivationRefusal,
  readAdtRefusal,
  readCheckRunRefusal,
  readDeletionRefusal,
  readExceptionRefusal,
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

const CORPUS = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'adt',
);

function body(name: string): string {
  const sidecar = JSON.parse(
    fs.readFileSync(path.join(CORPUS, `${name}.json`), 'utf-8'),
  );
  return fs.readFileSync(path.join(CORPUS, sidecar.response.bodyFile), 'utf-8');
}

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
    const refusal = readExceptionRefusal(body(name));
    expect(refusal).not.toBeNull();
    expect(refusal?.adtType).toBe(adtType);
    expect(refusal?.namespace).toBe('com.sap.adt');
    expect(refusal?.message.length).toBeGreaterThan(0);
  });

  it('keeps the message SAP wrote, including the user holding the lock', () => {
    const refusal = readExceptionRefusal(
      body('refusal-lock-held-by-other--01-lock'),
    );
    expect(refusal?.message).toContain('SAPUSER01');
    expect(refusal?.message).toContain('ZMCP_BLD_ANSCH01');
  });

  it('carries the T100 key, so a caller can act on the code not the sentence', () => {
    const refusal = readExceptionRefusal(
      body('refusal-object-not-found--01-read-source'),
    );
    expect(refusal?.t100).toEqual({ id: 'SADT_RESOURCE', no: '002' });
  });

  it('does not fire on a document that is not an exception', () => {
    expect(
      readExceptionRefusal(body('activation-success-verdict--01-activation')),
    ).toBeNull();
    expect(readExceptionRefusal('')).toBeNull();
  });
});

describe('form 2a — activation', () => {
  it('a failed activation is a refusal', () => {
    const refusal = readActivationRefusal(
      body('refusal-activation-fails--01-activation'),
    );
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('STRONG_BUT_NOT_A_REAL_TYPE');
  });

  it('a successful activation is NOT a refusal', () => {
    expect(
      readActivationRefusal(body('activation-success-verdict--01-activation')),
    ).toBeNull();
  });

  it('every message reaches the caller, not only the errors', () => {
    const refusal = readActivationRefusal(
      body('refusal-activation-fails--01-activation'),
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
    const warned = body('activation-success-verdict--01-activation').replace(
      '/>',
      '/><msg objDescr="x" type="W" line="1"><shortText><txt>careful</txt></shortText></msg>',
    );
    expect(readActivationRefusal(warned)).toBeNull();
  });
});

describe('form 2b — deletion', () => {
  it('the refused delete is a refusal at both steps', () => {
    expect(
      readDeletionRefusal(body('refusal-delete-refused--01-deletion-check')),
    ).not.toBeNull();
    expect(
      readDeletionRefusal(body('refusal-delete-refused--02-deletion-delete')),
    ).not.toBeNull();
  });

  it('the refusal repeats what SAP said', () => {
    const refusal = readDeletionRefusal(
      body('refusal-delete-refused--02-deletion-delete'),
    );
    expect(refusal?.message).toContain('ZMCP_BLD_ANSCH01');
    expect(refusal?.message).toContain('already editing');
  });

  it('the successful delete is NOT a refusal at either step', () => {
    expect(
      readDeletionRefusal(body('delete-success--01-deletion-check')),
    ).toBeNull();
    expect(
      readDeletionRefusal(body('delete-success--02-deletion-delete')),
    ).toBeNull();
  });

  it('a del:message of type S on a success does not trip the reading', () => {
    // The regression this guards: keying on the presence of del:message rather
    // than on the attribute. delete-success--02 carries one.
    const document = body('delete-success--02-deletion-delete');
    expect(document).toContain('del:message');
    expect(document).toContain('del:type="S"');
    expect(readDeletionRefusal(document)).toBeNull();
  });

  it('the deletionResult is read by isDeleted, not by the check attribute', () => {
    const document = body('delete-success--02-deletion-delete');
    expect(document).not.toContain('isDeletable');
    // A reader that looked for isDeletable and defaulted a missing one to false
    // would call this refused. This is the adt-clients deletionRefusal hazard.
    expect(readDeletionRefusal(document)).toBeNull();
  });
});

describe('form 3 — check runs', () => {
  it('a check that never ran is a refusal, though it carries no messages', () => {
    const refusal = readCheckRunRefusal(
      body('refusal-check-nonexistent-object--01-checkrun'),
    );
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('does not exist');
    expect(refusal?.messages).toHaveLength(0);
  });

  it('a syntax error on a check that DID run is a refusal', () => {
    const refusal = readCheckRunRefusal(
      body('refusal-syntax-check--01-checkrun'),
    );
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toContain('STRONG_BUT_NOT_A_REAL_TYPE');
  });

  it('a clean check is NOT a refusal', () => {
    expect(
      readCheckRunRefusal(body('check-success-verdict--01-checkrun')),
    ).toBeNull();
  });

  it('the status is read before the messages, or a missing object reads as clean', () => {
    // Stated as a test because it is the whole point of the ordering: the
    // notProcessed document has no checkMessageList to find an E in.
    const document = body('refusal-check-nonexistent-object--01-checkrun');
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

describe('form 4 — the walkers, where no reading is possible', () => {
  const missing = 'refusal-package-not-found-contents-empty--01-nodestructure';
  const empty = 'read-empty-package-contents--01-nodestructure';

  it('a missing package and an empty package are the same bytes', () => {
    expect(body(empty)).toBe(body(missing));
  });

  it('both are indeterminate, and no reading claims otherwise', () => {
    expect(isIndeterminateWalkAnswer(body(missing))).toBe(true);
    expect(isIndeterminateWalkAnswer(body(empty))).toBe(true);
    expect(readAdtRefusal(body(missing))).toBeNull();
  });

  it('a populated package is not indeterminate', () => {
    expect(
      isIndeterminateWalkAnswer(
        body('read-package-contents-structure--01-nodestructure'),
      ),
    ).toBe(false);
  });
});

describe('the dispatcher picks the right reading for each document', () => {
  it.each([
    ['refusal-object-not-found--01-read-source', 'exception'],
    ['refusal-activation-fails--01-activation', 'activation'],
    ['refusal-delete-refused--02-deletion-delete', 'deletion'],
    ['refusal-syntax-check--01-checkrun', 'checkrun'],
  ])('%s is read as form %s', (name, form) => {
    expect(readAdtRefusal(body(name))?.form).toBe(form);
  });

  it.each([
    'activation-success-verdict--01-activation',
    'check-success-verdict--01-checkrun',
    'delete-success--01-deletion-check',
    'delete-success--02-deletion-delete',
    'lock-success--01-lock',
    'read-class-source-text--01-read-source',
    'read-package-contents-structure--01-nodestructure',
    'read-where-used-list-structure--01-informationsystem-usagereferences',
    'read-transport-list-structure--01-cts-transportrequests',
    'read-table-metadata-structure--01-tables-zmcpshrrtabl',
  ])('%s is not read as a refusal by any of the four', (name) => {
    expect(readAdtRefusal(body(name))).toBeNull();
  });
});
