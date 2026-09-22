import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The corpus is committed, so what is in it is published.
 *
 * `scripts/capture-adt-corpus.ts` scrubs as it records — the Authorization
 * header, cookies, CSRF tokens, the session header, every secret the
 * environment holds, and the SAP user id, which becomes a stable placeholder
 * rather than a deletion so a strategy still sees that a user name sits there.
 *
 * It missed one for forty files: `sap-adt-saplb`, the name of the application
 * server that answered. `mcp-abap-adt-clients` keeps the same corpus and has
 * always redacted that header; its own guard is what noticed. A collector that
 * scrubs is not a check that it scrubbed — this is the check, and it reads the
 * committed files rather than the code that wrote them.
 */
const CORPUS = join(__dirname, '../../../tests/fixtures/adt');

const files = (() => {
  try {
    return readdirSync(CORPUS);
  } catch {
    return [];
  }
})();

const text = (name: string): string =>
  readFileSync(join(CORPUS, name), 'utf-8');

describe('the recorded corpus', () => {
  it('is there to check', () => {
    // A corpus that stopped being found would make every assertion below
    // vacuously true.
    expect(files.length).toBeGreaterThan(100);
  });

  it.each([
    ['an application server name', /appserver-[a-z0-9]/i],
    ['a bearer token', /Bearer\s+[A-Za-z0-9._-]{16,}/],
    ['an Authorization header value', /"authorization"\s*:\s*"(?!REDACTED)/i],
    ['a cookie value', /"set-cookie"\s*:\s*"(?!REDACTED)/i],
    ['a CSRF token', /"x-csrf-token"\s*:\s*"(?!REDACTED)/i],
    ['a host name', /[a-z0-9-]+\.(?:hana\.ondemand|ondemand)\.com/i],
    ['an IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ])('carries no %s', (_what, pattern) => {
    expect(files.filter((name) => pattern.test(text(name)))).toEqual([]);
  });

  /**
   * The placeholders are the other half: a scrub that deleted the field would
   * take the shape with it, and a reading has to keep seeing that a user id
   * sits in these documents.
   */
  it('keeps the user placeholder it promises', () => {
    const withUser = files.filter((name) => /SAPUSER01/.test(text(name)));
    expect(withUser.length).toBeGreaterThan(0);
  });

  /**
   * **And every user id in the corpus IS that placeholder.**
   *
   * The check above only proves the placeholder is somewhere, which a file
   * carrying a real name passes just as easily. One did: a document captured
   * by hand while chasing #211 went in with `adtcore:responsible`,
   * `createdBy` and `changedBy` naming the person who ran it, past every
   * pattern here, into a public repository — because the patterns were
   * written for secrets and a colleague's user id is not a secret, it is an
   * identity.
   *
   * `_SAPSUPPORT`, `DDIC` and the other names beginning with `_` or `SAP` are
   * SAP's own and say nothing about anybody.
   */
  const ALLOWED_USER = /^(?:SAPUSER01|DDIC|SAP\*?|_[A-Z0-9_]+)$/;

  it('names no real user in adtcore:responsible, createdBy or changedBy', () => {
    const offenders: string[] = [];
    for (const name of files) {
      for (const match of text(name).matchAll(
        /adtcore:(?:responsible|createdBy|changedBy)="([^"]*)"/g,
      )) {
        const who = match[1];
        if (who !== '' && !ALLOWED_USER.test(who))
          offenders.push(`${name}: ${who}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
