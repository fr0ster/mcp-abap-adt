/**
 * The one admission point of every abapGit call (spec §4.3, §4.4, §5.1),
 * driven as a function over a connection that answers R1 as SAP writes it
 * (sanitised documents, the shapes of `ABAPGIT_ST_REPOS_V2`): a denied
 * action, an undeclared `background`, the import refusal under
 * either restriction signal, a blank package — none of them taking a
 * connection, reading a credential or sending anything; then availability,
 * one credential-free R1 pre-read, the package check against R1's package,
 * the run-log pairing by `log_link` alone, and the endpoint binding.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AbapGitRestrictionSignal,
  type AdmissionContext,
  admitAbapGitCall,
  NO_ABAPGIT_RESTRICTIONS,
} from '../../../lib/abapGit/admission';
import { parseApprovedEndpoints } from '../../../lib/abapGit/approvedEndpoints';
import type {
  AccessCall,
  IAccessChecks,
} from '../../../lib/access/accessChecks';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { repositoryRoot } from '../../helpers/repoRoot';

const ATOM = 'xmlns:atom="http://www.w3.org/2005/Atom"';
const REL = 'http://www.sap.com/adt/abapgit/relations';
const KEY = '000001';
const REPO_URL = 'https://git.example.invalid/team/repo.git';
const PACKAGE = 'ZPKG_GIT';

/** R1 with one entry: its package and URL as given, its log and status links as asked. */
function r1(
  options: {
    packageName?: string;
    url?: string;
    logKey?: string;
    statusKey?: string;
    /** The repository segment of the log_link; the entry's own key by default. */
    logRepository?: string;
    /** A second log_link after the first, as `<repository>/<log key>`. */
    secondLog?: string;
    /** The first log_link's href as written, replacing the one built from `logKey`. */
    logHref?: string;
    /** A second log_link's href as written (empty included). */
    secondHref?: string;
  } = {},
): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><abapgitrepo:repositories xmlns:abapgitrepo="http://www.sap.com/adt/abapgit/repositories" ${ATOM}>` +
    '<abapgitrepo:repository>' +
    `<abapgitrepo:key>${KEY}</abapgitrepo:key>` +
    `<abapgitrepo:package>${options.packageName ?? PACKAGE}</abapgitrepo:package>` +
    `<abapgitrepo:url>${options.url ?? REPO_URL}</abapgitrepo:url>` +
    '<abapgitrepo:branchName>refs/heads/main</abapgitrepo:branchName>' +
    '<abapgitrepo:status>S</abapgitrepo:status><abapgitrepo:statusText>done</abapgitrepo:statusText>' +
    (options.statusKey === undefined
      ? ''
      : `<atom:link href="/sap/bc/adt/abapgit/repos/${KEY}/status/${options.statusKey}" rel="${REL}/status" type="status_link"/>`) +
    (options.logHref !== undefined
      ? `<atom:link href="${options.logHref}" rel="${REL}/log" type="log_link"/>`
      : options.logKey === undefined
        ? ''
        : `<atom:link href="/sap/bc/adt/abapgit/repos/${options.logRepository ?? KEY}/log/${options.logKey}" rel="${REL}/log" type="log_link"/>`) +
    (options.secondHref === undefined
      ? ''
      : `<atom:link href="${options.secondHref}" rel="${REL}/log" type="log_link"/>`) +
    (options.secondLog === undefined
      ? ''
      : `<atom:link href="/sap/bc/adt/abapgit/repos/${options.secondLog.split('/')[0]}/log/${options.secondLog.split('/')[1]}" rel="${REL}/log" type="log_link"/>`) +
    '</abapgitrepo:repository></abapgitrepo:repositories>'
  );
}

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly data: unknown;
  readonly stateless: boolean;
  readonly noLog: boolean;
}

/** A connection answering R1 with `document` (`status`), recording every request. */
function sapWith(document: string, status = 200) {
  const sent: Sent[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://sap.example.invalid';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      sent.push({
        url: options.url,
        method: options.method,
        headers: { ...(options.headers ?? {}) },
        data: options.data,
        stateless: options.stateless === true,
        noLog: options.noLog === true,
      });
      if (status >= 400) {
        throw Object.assign(new Error(`status ${status}`), {
          response: { status, statusText: '', headers: {}, data: '' },
        });
      }
      // A recorded body is text; `T` is the caller's view of it.
      return {
        data: document as T,
        status,
        statusText: 'OK',
        headers: {},
      };
    },
  };
  return { connection, sent };
}

/** What the admission was given, counted: connections taken, endpoint lookups, access calls. */
function contextOf(
  connection: IAbapConnection,
  options: {
    kind?: 'onprem' | 'cloud';
    deniedAction?: string;
    served?: boolean;
    accessChecks?: IAccessChecks;
  } = {},
) {
  const counts = { connections: 0, endpointLookups: 0 };
  const context: AdmissionContext = {
    kind: options.kind ?? 'cloud',
    deniedAction: () => options.deniedAction,
    connection: async () => {
      counts.connections += 1;
      return connection;
    },
    served: async () => options.served ?? true,
    endpoints: () => {
      counts.endpointLookups += 1;
      return {
        endpoints: parseApprovedEndpoints(
          [{ url: REPO_URL, user: 'git-user', token: 'git-token' }],
          'test',
        ),
      };
    },
    accessChecks: options.accessChecks,
    packageReader: () => ({ superPackageOf: async () => undefined }),
  };
  return { context, counts };
}

/** The refusal code of a verdict, else `admitted`. */
function codeOf(verdict: Awaited<ReturnType<typeof admitAbapGitCall>>): string {
  if ('admitted' in verdict) return 'admitted';
  return serverRefusalOf(verdict.refused)?.code ?? verdict.refused.message;
}

const admit = (
  tool: string,
  args: ToolArgs,
  context: AdmissionContext,
  restrictions: AbapGitRestrictionSignal = NO_ABAPGIT_RESTRICTIONS,
) => admitAbapGitCall({ tool, args }, restrictions, context);

const LINK_ARGS = {
  package_name: PACKAGE,
  url: REPO_URL,
  branch: 'refs/heads/main',
};

describe('the raw steps: nothing taken, nothing sent', () => {
  it('a denied compact action carrying background is refused in the narrowed words — no run', async () => {
    const sap = sapWith(r1());
    const { context, counts } = contextOf(sap.connection, {
      deniedAction:
        'Input validation error: Invalid arguments for tool HandlerAbapGit',
    });
    const verdict = await admit(
      'HandlerAbapGit',
      { action: 'push', repository_key: KEY, background: true },
      context,
    );
    assert.equal(
      codeOf(verdict),
      'Input validation error: Invalid arguments for tool HandlerAbapGit',
    );
    assert.equal(counts.connections, 0);
  });

  it('background where the schema does not declare it: cloud, or another action', async () => {
    for (const [kind, tool, args] of [
      ['cloud', 'PullAbapGitRepo', { repository_key: KEY, background: true }],
      [
        'onprem',
        'GetAbapGitStaging',
        { repository_key: KEY, background: false },
      ],
      [
        'onprem',
        'HandlerAbapGit',
        { action: 'unlink', repository_key: KEY, background: true },
      ],
    ] as const) {
      const sap = sapWith(r1());
      const { context, counts } = contextOf(sap.connection, { kind });
      assert.equal(
        codeOf(await admit(tool, args, context)),
        'abapgit_background_not_declared',
        `${kind} ${tool}`,
      );
      assert.equal(counts.connections, 0);
    }
  });

  it('a blank package_name is refused for link and branch info', async () => {
    for (const [tool, args] of [
      ['LinkAbapGitRepo', { ...LINK_ARGS, package_name: ' ' }],
      ['GetAbapGitBranchInfo', { url: REPO_URL, branch: 'main' }],
      ['HandlerAbapGit', { action: 'link', ...LINK_ARGS, package_name: '' }],
      ['HandlerAbapGit', { action: 'branch_info', url: REPO_URL, branch: 'b' }],
    ] as const) {
      const sap = sapWith(r1());
      const { context, counts } = contextOf(sap.connection, { kind: 'cloud' });
      assert.equal(
        codeOf(await admit(tool, args, context)),
        'abapgit_package_required',
        tool,
      );
      assert.equal(counts.connections, 0);
    }
  });
});

describe('the import refusal: link and pull under either restriction', () => {
  const signals: readonly [string, AbapGitRestrictionSignal][] = [
    ['packages', { packages: true, requests: false }],
    ['requests only', { packages: false, requests: true }],
    ['both', { packages: true, requests: true }],
  ];
  const calls: readonly [string, ToolArgs][] = [
    ['LinkAbapGitRepo', LINK_ARGS],
    ['PullAbapGitRepo', { repository_key: KEY }],
    ['HandlerAbapGit', { action: 'link', ...LINK_ARGS }],
    ['HandlerAbapGit', { action: 'pull', repository_key: KEY }],
  ];
  for (const kind of ['onprem', 'cloud'] as const) {
    for (const [label, signal] of signals) {
      for (const [tool, args] of calls) {
        it(`${kind}, ${label}: ${tool} ${String(args.action ?? '')} refused — zero requests, zero credential lookups`, async () => {
          const sap = sapWith(r1());
          const { context, counts } = contextOf(sap.connection, { kind });
          assert.equal(
            codeOf(await admit(tool, args, context, signal)),
            'abapgit_import_not_allowed',
          );
          assert.equal(counts.connections, 0);
          assert.equal(counts.endpointLookups, 0);
          assert.equal(sap.sent.length, 0);
        });
      }
    }
    for (const [tool, args] of calls) {
      it(`${kind}, no restriction: ${tool} ${String(args.action ?? '')} is admitted`, async () => {
        const sap = sapWith(r1());
        const { context } = contextOf(sap.connection, { kind });
        assert.equal(codeOf(await admit(tool, args, context)), 'admitted');
      });
    }
  }
});

describe('the steps after: availability, one R1, the package, the pairing, the binding', () => {
  it('a system that does not serve abapGit: refused, nothing sent', async () => {
    const sap = sapWith(r1());
    const { context } = contextOf(sap.connection, { served: false });
    assert.equal(
      codeOf(
        await admit('GetAbapGitStaging', { repository_key: KEY }, context),
      ),
      'abapgit_not_served',
    );
    assert.equal(sap.sent.length, 0);
  });

  it('an admitted keyed call reads exactly one R1 — stateless, unlogged, credential-free — and binds R1’s URL', async () => {
    const sap = sapWith(r1());
    const { context } = contextOf(sap.connection);
    const verdict = await admit(
      'PullAbapGitRepo',
      { repository_key: KEY },
      context,
    );
    assert.ok('admitted' in verdict);
    assert.equal(verdict.admitted.repo?.url, REPO_URL);
    assert.deepEqual(verdict.admitted.credentials, {
      user: 'git-user',
      password: 'git-token',
    });
    assert.equal(sap.sent.length, 1);
    const [read] = sap.sent;
    assert.equal(read?.method, 'GET');
    assert.equal(read?.url, '/sap/bc/adt/abapgit/repos');
    assert.equal(read?.stateless, true);
    assert.equal(read?.noLog, true);
    assert.equal(read?.data, undefined);
    const headers = Object.keys(read?.headers ?? {}).map((h) =>
      h.toLowerCase(),
    );
    assert.ok(!headers.includes('username') && !headers.includes('password'));
  });

  it('a padded approved URL in R1 still binds its credential', async () => {
    const sap = sapWith(r1({ url: `  ${REPO_URL} ` }));
    const verdict = await admit(
      'PullAbapGitRepo',
      { repository_key: KEY },
      contextOf(sap.connection).context,
    );
    assert.ok('admitted' in verdict);
    assert.equal(verdict.admitted.repo?.url, REPO_URL);
    assert.deepEqual(verdict.admitted.credentials, {
      user: 'git-user',
      password: 'git-token',
    });
  });

  it('push, unlink and branch switch are checked against R1’s package', async () => {
    for (const [tool, args] of [
      ['PushAbapGitRepo', { repository_key: KEY }],
      ['UnlinkAbapGitRepo', { repository_key: KEY }],
      [
        'SwitchAbapGitBranch',
        { repository_key: KEY, branch: 'b', create: false },
      ],
      ['HandlerAbapGit', { action: 'push', repository_key: KEY }],
    ] as const) {
      const checked: AccessCall[] = [];
      const sap = sapWith(r1());
      const { context } = contextOf(sap.connection, {
        accessChecks: {
          check: async (call) => {
            checked.push(call);
            return {
              allowed: false,
              code: 'package_not_allowed',
              argument: call.packages[0]?.argument ?? '',
              value: call.packages[0]?.value ?? '',
            };
          },
        },
      });
      assert.equal(
        codeOf(await admit(tool, args, context)),
        'package_not_allowed',
        tool,
      );
      assert.equal(checked[0]?.packages[0]?.value, PACKAGE, tool);
      assert.equal(sap.sent.length, 1, tool);
    }
  });

  it('fail closed: an unknown key, a blank package or URL, an unreadable R1', async () => {
    for (const [label, sap, args] of [
      ['unknown key', sapWith(r1()), { repository_key: '000999' }],
      [
        'blank package',
        sapWith(r1({ packageName: '' })),
        { repository_key: KEY },
      ],
      ['blank url', sapWith(r1({ url: '' })), { repository_key: KEY }],
      ['unreadable', sapWith('', 500), { repository_key: KEY }],
    ] as const) {
      const { context } = contextOf(sap.connection);
      assert.equal(
        codeOf(await admit('PushAbapGitRepo', args, context)),
        'abapgit_repository_unknown',
        label,
      );
      assert.equal(sap.sent.length, 1, label);
    }
  });

  it('the run log: a matching log_link pair is admitted; a foreign or missing key, or a status_link alone, is refused before the read', async () => {
    const paired = sapWith(r1({ logKey: 'A1B2C3' }));
    const ok = await admit(
      'GetAbapGitErrorLog',
      { repository_key: KEY, app_log_key: 'A1B2C3' },
      contextOf(paired.connection).context,
    );
    assert.equal(codeOf(ok), 'admitted');
    for (const [label, document, appLogKey] of [
      ['foreign key', r1({ logKey: 'A1B2C3' }), 'D4E5F6'],
      ['no log key', r1({ logKey: 'A1B2C3' }), undefined],
      ['status_link alone', r1({ statusKey: 'A1B2C3' }), 'A1B2C3'],
      [
        'log_link of another repository',
        r1({ logKey: 'A1B2C3', logRepository: '000002' }),
        'A1B2C3',
      ],
    ] as const) {
      const sap = sapWith(document);
      const args: ToolArgs =
        appLogKey === undefined
          ? { repository_key: KEY }
          : { repository_key: KEY, app_log_key: appLogKey };
      assert.equal(
        codeOf(
          await admit(
            'GetAbapGitErrorLog',
            args,
            contextOf(sap.connection).context,
          ),
        ),
        'abapgit_run_log_not_paired',
        label,
      );
      // Only the R1 read went out: never the log.
      assert.deepEqual(
        sap.sent.map((s) => s.url),
        ['/sap/bc/adt/abapgit/repos'],
        label,
      );
    }
  });

  it('a log_link with a query, a fragment or a dot key is never paired', async () => {
    for (const [href, asked] of [
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/A1B2C3?x`, 'A1B2C3'],
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/A1B2C3#x`, 'A1B2C3'],
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/%2e%2e`, '..'],
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/LOG%2F1`, 'LOG/1'],
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/LOG%31`, 'LOG%31'],
      [`/sap/bc/adt/abapgit/repos/${KEY}/log/`, ''],
    ] as const) {
      const sap = sapWith(r1({ logHref: href }));
      assert.equal(
        codeOf(
          await admit(
            'GetAbapGitErrorLog',
            { repository_key: KEY, app_log_key: asked },
            contextOf(sap.connection).context,
          ),
        ),
        'abapgit_run_log_not_paired',
        href,
      );
    }
  });

  it('a second log_link with an empty href is ambiguous too', async () => {
    const sap = sapWith(r1({ logKey: 'A1B2C3', secondHref: '' }));
    assert.equal(
      codeOf(
        await admit(
          'GetAbapGitErrorLog',
          { repository_key: KEY, app_log_key: 'A1B2C3' },
          contextOf(sap.connection).context,
        ),
      ),
      'abapgit_run_log_ambiguous',
    );
  });

  it('an entry with two log_links is ambiguous and refused, whichever pairs', async () => {
    for (const [label, document] of [
      [
        'own first, foreign second',
        r1({ logKey: 'A1B2C3', secondLog: '000002/A1B2C3' }),
      ],
      [
        'foreign first, own second',
        r1({
          logKey: 'A1B2C3',
          logRepository: '000002',
          secondLog: `${KEY}/A1B2C3`,
        }),
      ],
      ['two own', r1({ logKey: 'A1B2C3', secondLog: `${KEY}/D4E5F6` })],
    ] as const) {
      const sap = sapWith(document);
      assert.equal(
        codeOf(
          await admit(
            'GetAbapGitErrorLog',
            { repository_key: KEY, app_log_key: 'A1B2C3' },
            contextOf(sap.connection).context,
          ),
        ),
        'abapgit_run_log_ambiguous',
        label,
      );
      assert.equal(sap.sent.length, 1, label);
    }
  });

  it('a url route: userinfo refused before anything; a bound URL sends its credential; another goes anonymous', async () => {
    const sap = sapWith(r1());
    const refused = contextOf(sap.connection);
    assert.equal(
      codeOf(
        await admit(
          'CheckAbapGitExternalRepo',
          { url: 'https://u:p@git.example.invalid/x' },
          refused.context,
        ),
      ),
      'abapgit_url_refused',
    );
    assert.equal(sap.sent.length, 0);
    const bound = await admit(
      'CheckAbapGitExternalRepo',
      { url: REPO_URL },
      contextOf(sap.connection).context,
    );
    assert.ok('admitted' in bound);
    assert.equal(bound.admitted.sendUrl, REPO_URL);
    assert.equal(bound.admitted.credentials?.user, 'git-user');
    const anonymous = await admit(
      'CheckAbapGitExternalRepo',
      { url: 'https://git.example.invalid/other' },
      contextOf(sap.connection).context,
    );
    assert.ok('admitted' in anonymous);
    assert.equal(anonymous.admitted.credentials, null);
  });
});

/**
 * R1 as SAP's cloud abapGit answers it: three entries of the capture of
 * 2026-11-22 (GETs only, every user value scrubbed), each with its
 * `status_link` and `log_link`.
 */
const MEASURED = readFileSync(
  join(
    repositoryRoot(__dirname),
    'src/__tests__/fixtures/abapGit/r1-cloud-measured.xml',
  ),
  'utf-8',
);
const MEASURED_KEY = '000000000007';
const MEASURED_LOG = '067391FAB8E31FD1A7E72E6A3E129651';

describe('the run-log pairing on measured links', () => {
  const pairing = async (document: string, key: string, log: string) =>
    codeOf(
      await admit(
        'GetAbapGitErrorLog',
        { repository_key: key, app_log_key: log },
        contextOf(sapWith(document).connection, { kind: 'cloud' }).context,
      ),
    );

  it('a real link pairs', async () => {
    assert.equal(
      await pairing(MEASURED, MEASURED_KEY, MEASURED_LOG),
      'admitted',
    );
  });

  it('a log key in lowercase hex is refused', async () => {
    const lower = MEASURED_LOG.toLowerCase();
    assert.equal(
      await pairing(
        MEASURED.split(MEASURED_LOG).join(lower),
        MEASURED_KEY,
        lower,
      ),
      'abapgit_run_log_not_paired',
    );
  });

  it('a log key with _ is refused', async () => {
    const underscored = `${MEASURED_LOG.slice(0, -1)}_`;
    assert.equal(
      await pairing(
        MEASURED.split(MEASURED_LOG).join(underscored),
        MEASURED_KEY,
        underscored,
      ),
      'abapgit_run_log_not_paired',
    );
  });

  it('a letter in the repository key is refused', async () => {
    const lettered = '00000000000A';
    assert.equal(
      await pairing(
        MEASURED.split(MEASURED_KEY).join(lettered),
        lettered,
        MEASURED_LOG,
      ),
      'abapgit_run_log_not_paired',
    );
  });

  const REAL_LINK = `<atom:link href="/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}" rel="http://www.sap.com/adt/abapgit/relations/log" type="log_link" xmlns:atom="http://www.w3.org/2005/Atom"/>`;

  /** The capture with the entry's real log_link replaced by `links`. */
  const withLinks = (links: string): string => {
    assert.ok(MEASURED.includes(REAL_LINK), 'the capture holds the real link');
    return MEASURED.split(REAL_LINK).join(links);
  };

  it('a second log_link whose type is a namespaced attribute is counted: ambiguous', async () => {
    const second = `<atom:link href="/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}" rel="http://www.sap.com/adt/abapgit/relations/log" atom:type="log_link" xmlns:atom="http://www.w3.org/2005/Atom"/>`;
    assert.equal(
      await pairing(withLinks(REAL_LINK + second), MEASURED_KEY, MEASURED_LOG),
      'abapgit_run_log_ambiguous',
    );
  });

  it('a log_link whose href is a child element is refused', async () => {
    const child = `<atom:link rel="http://www.sap.com/adt/abapgit/relations/log" type="log_link" xmlns:atom="http://www.w3.org/2005/Atom"><atom:href>/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}</atom:href></atom:link>`;
    assert.equal(
      await pairing(withLinks(child), MEASURED_KEY, MEASURED_LOG),
      'abapgit_run_log_not_paired',
    );
  });

  for (const [label, path] of [
    [
      'a /./ segment',
      `/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/./log/${MEASURED_LOG}`,
    ],
    [
      'a /%2e/ segment',
      `/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/%2e/log/${MEASURED_LOG}`,
    ],
    [
      'an extra segment',
      `/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}/x`,
    ],
    [
      'a host',
      `https://elsewhere.invalid/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}`,
    ],
  ] as const) {
    it(`a log_link href with ${label} is refused`, async () => {
      const link = REAL_LINK.replace(
        `/sap/bc/adt/abapgit/repos/${MEASURED_KEY}/log/${MEASURED_LOG}`,
        path,
      );
      assert.equal(
        await pairing(withLinks(link), MEASURED_KEY, MEASURED_LOG),
        'abapgit_run_log_not_paired',
      );
    });
  }

  it('a foreign-namespace key on an earlier entry lends nothing to the real one', async () => {
    const NS = 'http://www.sap.com/adt/abapgit/repositories';
    const document =
      `<?xml version="1.0" encoding="utf-8"?><abapgitrepo:repositories xmlns:abapgitrepo="${NS}">` +
      // An earlier entry whose key is in a foreign namespace, with a log link.
      `<abapgitrepo:repository><f:key xmlns:f="urn:foreign">${MEASURED_KEY}</f:key>` +
      '<abapgitrepo:package>SCRUBBED</abapgitrepo:package><abapgitrepo:url>SCRUBBED</abapgitrepo:url>' +
      '<abapgitrepo:branchName>SCRUBBED</abapgitrepo:branchName>' +
      `${REAL_LINK}</abapgitrepo:repository>` +
      // The real entry: no log link.
      `<abapgitrepo:repository><abapgitrepo:key>${MEASURED_KEY}</abapgitrepo:key>` +
      '<abapgitrepo:package>SCRUBBED</abapgitrepo:package><abapgitrepo:url>SCRUBBED</abapgitrepo:url>' +
      '<abapgitrepo:branchName>SCRUBBED</abapgitrepo:branchName>' +
      '</abapgitrepo:repository></abapgitrepo:repositories>';
    assert.equal(
      await pairing(document, MEASURED_KEY, MEASURED_LOG),
      'abapgit_run_log_not_paired',
    );
  });

  it('an entry in a foreign namespace is not the repository', async () => {
    const foreign = MEASURED.split('<abapgitrepo:repository>')
      .join('<x:repository xmlns:x="urn:foreign">')
      .split('</abapgitrepo:repository>')
      .join('</x:repository>');
    assert.equal(
      await pairing(foreign, MEASURED_KEY, MEASURED_LOG),
      'abapgit_repository_unknown',
    );
  });

  it('on premise: no run log is served (its R1 carries no log_link), refused before anything', async () => {
    const sap = sapWith(MEASURED);
    const { context, counts } = contextOf(sap.connection, { kind: 'onprem' });
    assert.equal(
      codeOf(
        await admit(
          'GetAbapGitErrorLog',
          { repository_key: MEASURED_KEY, app_log_key: MEASURED_LOG },
          context,
        ),
      ),
      'abapgit_run_log_not_served',
    );
    assert.equal(counts.connections, 0);
    assert.equal(sap.sent.length, 0);
  });
});
