import * as fs from 'node:fs';
import * as path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { ADT_CORPUS_DIR, corpusBody, corpusSidecar } from '../../lib/adtCorpus';

/**
 * Offline assertions over the raw ADT corpus in tests/fixtures/adt/.
 *
 * These do not test our code. They pin down what SAP actually sends, so that a
 * result/error strategy written later is written against the document rather
 * than against an assumption about it — the failure mode that broke the
 * transport-tree parser in #168.
 *
 * Every assertion below must hold for the corpus to still describe the system.
 * If SAP changes a shape, one of these fails and the strategy gets revisited
 * before it silently starts reading a refusal as a success.
 *
 * No network. No session. Pure file reads.
 */

const CORPUS_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'adt',
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseAttributeValue: false,
  removeNSPrefix: true,
});

interface Sidecar {
  case: string;
  step: number;
  request: {
    method: string;
    url: string;
    effectiveUrl?: string;
    params: Record<string, string> | null;
  };
  response: {
    status: number | string;
    headers: Record<string, string>;
    bodyFile: string;
  };
}

function xml(name: string): any {
  return parser.parse(corpusBody(name));
}

/** Normalise "one child" vs "many children" — the #168 trap. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

describe('shape 1 — the HTTP status carries the refusal (exc:exception)', () => {
  const cases = [
    [
      'refusal-object-not-found--01-read-source',
      404,
      'ExceptionResourceNotFound',
    ],
    [
      'refusal-package-not-found-tree--01-packages-zmcpbldnopkg9x',
      404,
      'ExceptionResourceNotFound',
    ],
    ['refusal-lock-held-by-other--01-lock', 403, 'ExceptionResourceNoAccess'],
    [
      'refusal-write-not-locked--01-update-source',
      423,
      'ExceptionResourceInvalidLockHandle',
    ],
  ] as const;

  it.each(
    cases,
  )('%s answers %i with a machine-readable type id', (name, status, typeId) => {
    expect(corpusSidecar(name).response.status).toBe(status);
    const exception = xml(name).exception;
    expect(exception).toBeDefined();
    expect(exception.type['@id']).toBe(typeId);
  });

  it.each(cases)('%s carries a readable message and a namespace', (name) => {
    const exception = xml(name).exception;
    expect(exception.namespace['@id']).toBe('com.sap.adt');
    const message = exception.message;
    const text = typeof message === 'string' ? message : message['#text'];
    expect(typeof text).toBe('string');
    expect(String(text).length).toBeGreaterThan(0);
  });

  it('exposes the T100 message key in properties, for callers that want the code', () => {
    const entries = asArray(
      xml('refusal-object-not-found--01-read-source').exception.properties
        .entry,
    );
    const keys = entries.map((e: any) => e['@key']);
    expect(keys).toContain('T100KEY-ID');
    expect(keys).toContain('T100KEY-NO');
  });
});

describe('shape 2 — a boolean attribute carries the refusal, under HTTP 200', () => {
  it('a FAILED activation is HTTP 200 with activationExecuted=false', () => {
    const name = 'refusal-activation-fails--01-activation';
    expect(corpusSidecar(name).response.status).toBe(200);
    const properties = xml(name).messages.properties;
    expect(properties['@activationExecuted']).toBe('false');
  });

  it('a SUCCESSFUL activation is the same status and the same document type', () => {
    const name = 'activation-success-verdict--01-activation';
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(xml(name).messages.properties['@activationExecuted']).toBe('true');
  });

  it('only the failed activation carries error messages', () => {
    const failed = asArray(
      xml('refusal-activation-fails--01-activation').messages.msg,
    );
    const passed = asArray(
      xml('activation-success-verdict--01-activation').messages.msg,
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.map((m: any) => m['@type'])).toContain('E');
    expect(passed).toHaveLength(0);
  });

  it('a REFUSED delete is HTTP 200 with isDeleted=false', () => {
    const name = 'refusal-delete-refused--01-deletion-delete';
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(xml(name).deletionResult.object['@isDeleted']).toBe('false');
  });

  it('a SUCCESSFUL delete is HTTP 200 with isDeleted=true', () => {
    const name = 'delete-success--01-deletion-delete';
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(xml(name).deletionResult.object['@isDeleted']).toBe('true');
  });

  it('the deletion pre-check answers isDeletable, not a status code', () => {
    expect(
      corpusSidecar('refusal-deletion-check-refuses--01-deletion-check')
        .response.status,
    ).toBe(200);
    expect(
      xml('refusal-deletion-check-refuses--01-deletion-check').checkResponse
        .object['@isDeletable'],
    ).toBe('false');
    expect(
      xml('deletion-check-allows--01-deletion-check').checkResponse.object[
        '@isDeletable'
      ],
    ).toBe('true');
  });

  it('presence of del:message is NOT a refusal signal — a success carries one too', () => {
    const ok = xml('delete-success--01-deletion-delete').deletionResult.object;
    const refused = xml('refusal-delete-refused--01-deletion-delete')
      .deletionResult.object;
    expect(ok.message).toBeDefined();
    expect(refused.message).toBeDefined();
    // The type attribute is what separates them.
    expect(ok.message['@type']).toBe('S');
    expect(refused.message['@type']).toBe('E');
  });

  it('the refused delete states the reason in text; the successful one leaves it empty', () => {
    const refused = xml('refusal-delete-refused--01-deletion-delete')
      .deletionResult.object;
    expect(String(refused.message.text)).toContain('ZMCP_BLD_ANSCH01');
    const ok = xml('delete-success--01-deletion-delete').deletionResult.object;
    expect(String(ok.message.text ?? '')).toBe('');
  });
});

describe('shape 3 — checkruns need the status attribute before the messages', () => {
  it('a check on a missing object is HTTP 200 with status=notProcessed', () => {
    const name = 'refusal-check-nonexistent-object--01-checkrun';
    expect(corpusSidecar(name).response.status).toBe(200);
    const report = xml(name).checkRunReports.checkReport;
    expect(report['@status']).toBe('notProcessed');
    expect(String(report['@statusText'])).toContain('does not exist');
  });

  it('a notProcessed report has no message list to inspect', () => {
    const report = xml('refusal-check-nonexistent-object--01-checkrun')
      .checkRunReports.checkReport;
    expect(report.checkMessageList).toBeUndefined();
  });

  it('a syntax error is status=processed plus a checkMessage of type E', () => {
    const name = 'refusal-syntax-check--01-checkrun';
    expect(corpusSidecar(name).response.status).toBe(200);
    const report = xml(name).checkRunReports.checkReport;
    expect(report['@status']).toBe('processed');
    const messages = asArray(report.checkMessageList.checkMessage);
    expect(messages.map((m: any) => m['@type'])).toContain('E');
  });

  it('a clean check is also status=processed, and differs only by having no messages', () => {
    const report = xml('check-success-verdict--01-checkrun').checkRunReports
      .checkReport;
    expect(report['@status']).toBe('processed');
    expect(report.checkMessageList).toBeUndefined();
  });
});

describe('shape 4 — the package walkers answer nothing at all', () => {
  const walkers = [
    'refusal-package-not-found-contents-empty--01-nodestructure',
    'refusal-package-not-found-objectslist-empty--01-nodestructure',
    'refusal-package-not-found-hierarchy-direct--01-nodestructure',
  ];

  it.each(walkers)('%s is HTTP 200 with an empty body', (name) => {
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(corpusBody(name)).toBe('');
  });

  it('an EXISTING but empty package gives a byte-identical answer', () => {
    const missing =
      'refusal-package-not-found-contents-empty--01-nodestructure';
    const empty = 'read-empty-package-contents--01-nodestructure';
    expect(corpusSidecar(empty).response.status).toBe(
      corpusSidecar(missing).response.status,
    );
    expect(corpusBody(empty)).toBe(corpusBody(missing));
    // Different packages were asked for; only the request tells them apart.
    expect(corpusSidecar(empty).request.params?.parent_name).not.toBe(
      corpusSidecar(missing).request.params?.parent_name,
    );
  });

  it('a populated package is the only one of the three that answers anything', () => {
    const name = 'read-package-contents-structure--01-nodestructure';
    expect(corpusSidecar(name).response.status).toBe(200);
    expect(corpusBody(name).length).toBeGreaterThan(0);
    expect(xml(name).abap.values.DATA.OBJECT_TYPES).toBeDefined();
  });
});

describe('the corpus records enough to reproduce a request', () => {
  it('every nodestructure exchange names the object it asked about', () => {
    const names = fs
      .readdirSync(CORPUS_DIR)
      .filter((f) => f.endsWith('-nodestructure.json'))
      .map((f) => f.replace(/\.json$/, ''));
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const { request } = corpusSidecar(name);
      // The bare url is the same for all of them; params is what distinguishes.
      expect(request.url).toBe('/sap/bc/adt/repository/nodestructure');
      expect(request.params?.parent_name).toBeTruthy();
      expect(request.effectiveUrl).toContain('parent_name=');
    }
  });

  it('no credential and no SAP user id reached the corpus', () => {
    for (const file of fs.readdirSync(CORPUS_DIR)) {
      if (file === 'README.md') continue;
      const text = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf-8');
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT
      expect(text.toLowerCase()).not.toContain('bearer ');
      expect(text).not.toMatch(/CB\d{10}/); // the trial system's user id
    }
  });
});
