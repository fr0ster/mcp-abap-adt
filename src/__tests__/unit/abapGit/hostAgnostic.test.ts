/**
 * abapGit is host-agnostic (spec §5.4): SAP's abapGit reaches any git host
 * over HTTPS and decides nothing by host, so the server's abapGit code names
 * none — no host list, no host-specific parsing. A plain, case-insensitive
 * search of every source under the abapGit directories for the hosts SAP's
 * own sources were searched for.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const ROOT = repositoryRoot(__dirname);

const DIRECTORIES = [
  'src/lib/abapGit',
  'src/handlers/abapgit',
  'src/lib/compact/abapGit',
] as const;

const HOSTS = [
  'github',
  'gitlab',
  'bitbucket',
  'azure',
  'visualstudio',
  'gitea',
  'codecommit',
] as const;

function sourcesUnder(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(full, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  return files;
}

describe('the abapGit sources name no git host', () => {
  it('reads the abapGit sources', () => {
    assert.ok(sourcesUnder('src/lib/abapGit').length > 0);
  });

  it('no source under the abapGit directories names a host', () => {
    const found: string[] = [];
    for (const dir of DIRECTORIES) {
      for (const file of sourcesUnder(dir)) {
        const text = fs.readFileSync(file, 'utf8').toLowerCase();
        for (const host of HOSTS) {
          if (text.includes(host)) {
            found.push(`${path.relative(ROOT, file)}: ${host}`);
          }
        }
      }
    }
    assert.deepEqual(found, []);
  });
});
