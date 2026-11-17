/**
 * `HandlerSystem` `package_tree`, live, on both systems, read only: the
 * tree of the shared package the configuration names (`shared_dependencies`
 * `package`), through the server's dispatch (`throughServer`) — with
 * `background: false` in the call, and without `background` as a run read
 * once with `HandlerBackgroundRunGet`. The tree is the package's: its name,
 * and its objects as children (the shared package holds the shared
 * objects).
 *
 * Nothing is created, changed or deleted.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSharedDependenciesConfig } from '../helpers/configHelpers';
import {
  type LiveAnswer,
  liveCall,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';
import { finishedRun, startedRun } from './systemRuns';

/** The shared package the configuration names. */
function sharedPackage(): string {
  const named = member(getSharedDependenciesConfig(), 'package');
  if (typeof named !== 'string' || named === '') {
    throw new Error('the test config names no shared package');
  }
  return named.toUpperCase();
}

/** The shared package's tree: its name, and children under its root. */
function expectSharedTree(answer: LiveAnswer): void {
  const payload = payloadOf(succeeded('HandlerSystem package_tree', answer));
  assert.equal(member(payload, 'package_name'), sharedPackage());
  const children = member(member(payload, 'tree'), 'children');
  assert.ok(
    Array.isArray(children) && children.length > 0,
    `the tree of ${sharedPackage()} has no children: ${answer.text.slice(0, 2000)}`,
  );
}

liveSuite(['onprem', 'cloud'], 'HandlerSystem package_tree', () => {
  describe('through the server', () => {
    throughServer();

    it('background false answers the shared package tree in the call', async () => {
      const answer = await liveCall('HandlerSystem', {
        action: 'package_tree',
        package_name: sharedPackage(),
        background: false,
      });
      expectSharedTree(answer);
    });

    it('without background it starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        action: 'package_tree',
        package_name: sharedPackage(),
      });
      expectSharedTree(await finishedRun(startedRun(started)));
    });
  });
});
