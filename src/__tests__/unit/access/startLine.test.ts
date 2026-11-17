/**
 * The start line (spec §2.3): `none` with nothing configured; else one
 * clause per configured row with its count, the unmatched deny entries named,
 * the strategy named only for the tree strategy.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { accessStartLine } from '../../../lib/access/startLine';

const NAME = 'test';
const denied = (...entries: string[]) =>
  entries.map((entry) => parseDeniedEntry(entry, NAME));
const packages = (...entries: string[]) =>
  entries.map((entry) => parsePackageEntry(entry, NAME));

describe('accessStartLine', () => {
  it('nothing configured', () => {
    assert.equal(
      accessStartLine({ deniedActions: [], lists: {} }, [], false),
      '[MCP] Access restrictions: none',
    );
  });

  it('the spec’s line, the tree named', () => {
    assert.equal(
      accessStartLine(
        {
          deniedActions: denied(
            'DeleteClass',
            'Delete*',
            'HandlerBatch.end',
            'DebugStep',
          ),
          lists: {
            allowedPackages: packages('ZFOO', 'Z*', 'ZBAR/**'),
            allowedRequests: [
              parseRequestEntry('A4HK*', NAME),
              parseRequestEntry('B4HK1', NAME),
            ],
          },
        },
        ['DebugStep'],
        true,
      ),
      '[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2',
    );
  });

  it('the simple strategy carries no strategy words', () => {
    assert.equal(
      accessStartLine(
        {
          deniedActions: [],
          lists: { allowedPackages: packages('ZFOO', 'Z*') },
        },
        [],
        false,
      ),
      '[MCP] Access restrictions: allowed-packages 2',
    );
  });

  it('the table lists', () => {
    const tables = [
      parseTableEntry('MARA', NAME),
      parseTableEntry('ZT*', NAME),
    ];
    assert.equal(
      accessStartLine(
        { deniedActions: [], lists: { deniedTables: tables } },
        [],
        false,
      ),
      '[MCP] Access restrictions: denied-tables 2',
    );
    assert.equal(
      accessStartLine(
        { deniedActions: [], lists: { allowedTables: tables } },
        [],
        false,
      ),
      '[MCP] Access restrictions: allowed-tables 2',
    );
  });
});
