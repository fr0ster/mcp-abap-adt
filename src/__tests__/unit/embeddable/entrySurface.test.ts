/**
 * The embeddable entry's surface (the owner's decision): of the
 * shutdown machinery it exports only what an embedder needs to close its own
 * instance — `closeInstance` and the `ClosableInstance` it takes — beside
 * `activeTools()`. The process's latch, settlement, the connection-ends
 * registry and the shutdown sequence are the launchers', reached through
 * `@mcp-abap-adt/lib/state` (latch, settlement, sentence, sequence) or not
 * exported at all.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as embeddable from '../../../embeddable';
import * as state from '../../../lib/state';

const REMOVED_VALUES = [
  'latch',
  'isLatched',
  'pending',
  'settled',
  'shutdownRefusal',
  'SHUTDOWN_SENTENCE',
  'isClosing',
  'CLOSE_FAILED_WORDS',
  'closeOwnedConnections',
  'endConnection',
  'forceClose',
  'isEnded',
  'own',
  'ownedConnections',
  'cutShortLine',
  'installShutdownSequence',
  'processFailedLine',
  'stillRunningLine',
  'abortActiveTools',
];
const REMOVED_TYPES = [
  'ActiveToolEntry',
  'ConnectionRole',
  'ShutdownProcess',
  'ShutdownRun',
  'ShutdownSequenceOptions',
];

it('exports closeInstance and activeTools, and none of the launcher machinery', () => {
  expect(typeof embeddable.closeInstance).toBe('function');
  expect(typeof embeddable.activeTools).toBe('function');
  for (const name of REMOVED_VALUES) {
    expect(Object.keys(embeddable)).not.toContain(name);
  }
});

it('names none of the removed types', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../../embeddable/index.ts'),
    'utf8',
  );
  for (const name of REMOVED_TYPES) {
    expect(source).not.toContain(name);
  }
  expect(source).toContain('ClosableInstance');
});

it('the launchers reach what they need through lib/state', () => {
  for (const name of [
    'isLatched',
    'settled',
    'SHUTDOWN_SENTENCE',
    'installShutdownSequence',
  ]) {
    expect(Object.keys(state)).toContain(name);
  }
});
