/**
 * The abapGit live suite's git remote: its credentials and the run's
 * branches.
 *
 * Test-only, and the only host-specific code of the suite: the run makes its
 * branches through GitHub's REST API (Git Data API: blob, tree, commit, then
 * `POST …/git/refs`) with the test token, and deletes them at the end
 * (`DELETE …/git/refs/heads/{name}`). The token creating and deleting refs
 * was measured (201 and 204).
 *
 * **The token is never printed or logged.** Nothing here logs; an error
 * names the method, the API path and the status — never a header, never a
 * request body, and of GitHub's answer only its `message` field.
 *
 * Ported from adt-clients' live suite helper
 * (`packages/adt-clients/src/__tests__/helpers/abapGitRemote.ts`): the same
 * env file, keys and branch fixtures. The server's suites hand the same
 * remote to the server as its approved endpoint (`approvedEndpointOf`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as dotenv from 'dotenv';

/** `~/.config/mcp-abap-adt/sessions/abapgit-live.env` (Documents on Windows). */
export function remoteEnvPath(): string {
  const base =
    process.platform === 'win32'
      ? join(homedir(), 'Documents', 'mcp-abap-adt')
      : join(homedir(), '.config', 'mcp-abap-adt');
  return join(base, 'sessions', 'abapgit-live.env');
}

export interface IAbapGitRemote {
  /** The remote URL SAP is given, as configured. */
  readonly url: string;
  readonly user: string;
  /** The token: a credential, never printed. */
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
}

/**
 * The remote from the env file, or the reason there is none — the suite
 * skips with that reason. Only `https://github.com/<owner>/<repo>[.git]` is
 * taken: the branch fixtures speak GitHub's API.
 */
export function readRemote(
  path: string = remoteEnvPath(),
): IAbapGitRemote | { readonly missing: string } {
  if (!existsSync(path)) return { missing: `no ${path}` };
  const parsed = dotenv.parse(readFileSync(path));
  const url = parsed.ABAPGIT_REPO_URL?.trim();
  const user = parsed.ABAPGIT_USER?.trim();
  const token = parsed.ABAPGIT_TOKEN?.trim();
  const absent = [
    ['ABAPGIT_REPO_URL', url],
    ['ABAPGIT_USER', user],
    ['ABAPGIT_TOKEN', token],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (absent.length > 0 || !url || !user || !token)
    return { missing: `${path} states no ${absent.join(', ')}` };
  const where = gitHubRepoOf(url);
  if (!where)
    return {
      missing: `ABAPGIT_REPO_URL in ${path} is not https://github.com/<owner>/<repo>: the branch fixtures use GitHub's API`,
    };
  return { url, user, token, ...where };
}

/** `https://github.com/<owner>/<repo>[.git]` taken apart, or `undefined`. */
export function gitHubRepoOf(
  url: string,
): { readonly owner: string; readonly repo: string } | undefined {
  const prefix = 'https://github.com/';
  const tail = url.startsWith(prefix) ? url.slice(prefix.length) : '';
  const [owner, rawRepo, ...rest] = tail.split('/');
  const repo = rawRepo?.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  if (!owner || !repo || rest.some((segment) => segment !== ''))
    return undefined;
  return { owner, repo };
}

/** A GitHub answer that was not the one expected: method, path, status. */
export class GitHubRefusal extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    githubMessage: string | undefined,
  ) {
    super(
      `GitHub ${method} ${path} answered ${status}${githubMessage ? `: ${githubMessage}` : ''}`,
    );
    this.name = 'GitHubRefusal';
  }
}

/**
 * The abapGit settings file of an object-empty branch: starting folder
 * `/src/`, folder logic `FULL`, no object.
 */
export const ABAPGIT_SETTINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 <asx:values>
  <DATA>
   <MASTER_LANGUAGE>E</MASTER_LANGUAGE>
   <STARTING_FOLDER>/src/</STARTING_FOLDER>
   <FOLDER_LOGIC>FULL</FOLDER_LOGIC>
   <IGNORE>
    <item>/.gitignore</item>
    <item>/LICENSE</item>
    <item>/README.md</item>
   </IGNORE>
  </DATA>
 </asx:values>
</asx:abap>
`;

/** A string member of a JSON answer, or `undefined`. */
function stringField(json: unknown, key: string): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const value: unknown = Reflect.get(json, key);
  return typeof value === 'string' ? value : undefined;
}

export class GitHubFixtures {
  constructor(private readonly remote: IAbapGitRemote) {}

  /**
   * The same token against the remote `url` a ledger entry recorded: a
   * branch is deleted where it was made, never in whatever remote is
   * configured now.
   */
  forUrl(url: string): GitHubFixtures {
    const where = gitHubRepoOf(url);
    if (!where)
      throw new Error(
        'the ledger records a remote that is not https://github.com/<owner>/<repo>: its branches are not deleted from here',
      );
    return new GitHubFixtures({ ...this.remote, url, ...where });
  }

  private async call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    expected: readonly number[],
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const apiPath = `/repos/${this.remote.owner}/${this.remote.repo}${path}`;
    const response = await fetch(`https://api.github.com${apiPath}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.remote.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mcp-abap-adt-abapgit-live-test',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!expected.includes(response.status)) {
      const message = stringField(json, 'message');
      throw new GitHubRefusal(method, apiPath, response.status, message);
    }
    return { status: response.status, json };
  }

  /**
   * A parentless commit holding only the abapGit settings file: the
   * object-empty fixture every branch of a run starts from. Answers its sha.
   */
  async createEmptyCommit(): Promise<string> {
    const blob = await this.call('POST', '/git/blobs', [201], {
      content: ABAPGIT_SETTINGS_XML,
      encoding: 'utf-8',
    });
    const tree = await this.call('POST', '/git/trees', [201], {
      tree: [
        {
          path: '.abapgit.xml',
          mode: '100644',
          type: 'blob',
          sha: stringField(blob.json, 'sha'),
        },
      ],
    });
    const commit = await this.call('POST', '/git/commits', [201], {
      message: 'abapGit live test: object-empty fixture',
      tree: stringField(tree.json, 'sha'),
      parents: [],
    });
    const sha = stringField(commit.json, 'sha');
    if (!sha) throw new Error('GitHub answered a commit without its sha');
    return sha;
  }

  /** Make the branch `name` at `sha`. */
  async createBranch(name: string, sha: string): Promise<void> {
    await this.call('POST', '/git/refs', [201], {
      ref: `refs/heads/${name}`,
      sha,
    });
  }

  /**
   * Delete a branch. Resolves once its absence is confirmed: `204` deleted;
   * a `404` for the ref — from the DELETE, or from reading the exact ref
   * after a `422`, which proves nothing by itself — counts only once the
   * token is shown to see the repository (`GET /repos/{owner}/{repo}`,
   * `200`): GitHub answers `404` for a repository the token cannot see too.
   * A ref still there, a repository not visible, or any other answer throws,
   * and the ledger keeps the ref.
   */
  async deleteBranch(name: string): Promise<'deleted' | 'absent'> {
    const answer = await this.call(
      'DELETE',
      `/git/refs/heads/${encodeURIComponent(name)}`,
      [204, 404, 422],
    );
    if (answer.status === 204) return 'deleted';
    if (answer.status === 422 && (await this.branchExists(name)))
      throw new Error(
        `branch ${name} was refused deletion (422) and still exists in ${this.remote.owner}/${this.remote.repo}`,
      );
    await this.confirmRepositoryVisible(name);
    return 'absent';
  }

  /** The `404` of a ref means absence only if the token sees the repository. */
  private async confirmRepositoryVisible(name: string): Promise<void> {
    const answer = await this.call('GET', '', [200, 401, 403, 404]);
    if (answer.status !== 200)
      throw new Error(
        `branch ${name}: the token cannot see ${this.remote.owner}/${this.remote.repo} (GET /repos answered ${answer.status}), so a 404 for the ref proves nothing; the ref stays in the ledger`,
      );
  }

  /** Whether a branch exists. */
  async branchExists(name: string): Promise<boolean> {
    const answer = await this.call(
      'GET',
      `/git/ref/heads/${encodeURIComponent(name)}`,
      [200, 404],
    );
    return answer.status === 200;
  }

  /** A file of a branch: its text and blob sha, or `undefined` when absent. */
  async readFile(
    branch: string,
    path: string,
  ): Promise<{ text: string; sha: string } | undefined> {
    const answer = await this.call(
      'GET',
      `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
      [200, 404],
    );
    if (answer.status === 404) return undefined;
    const content = stringField(answer.json, 'content');
    const sha = stringField(answer.json, 'sha');
    if (content === undefined || sha === undefined)
      throw new Error(`GitHub answered ${path} without content or sha`);
    return { text: Buffer.from(content, 'base64').toString('utf8'), sha };
  }

  /** Replace a file of a branch with one commit. */
  async writeFile(
    branch: string,
    path: string,
    text: string,
    sha: string,
    message: string,
  ): Promise<void> {
    await this.call(
      'PUT',
      `/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
      [200],
      {
        message,
        content: Buffer.from(text, 'utf8').toString('base64'),
        sha,
        branch,
      },
    );
  }
}
