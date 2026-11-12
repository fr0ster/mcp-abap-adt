/**
 * The per-file close (D27, spec §2): preloaded by the node:test runner in
 * every file's process, it registers a root `after` that closes whatever
 * connections the file opened through the helpers (`trackConnection`), so
 * their HTTP sessions end with a logoff instead of waiting out the server's
 * timeout. Root hooks run after every hook of the file's own suites. A unit
 * file opens none, and this does nothing there.
 */
import { after } from 'node:test';
import { closeTrackedConnections } from './openConnections';

// `node --test` loads the preloads in its own process too, which runs no
// test file: only a file's process (`NODE_TEST_CONTEXT` set) registers it.
if (process.env.NODE_TEST_CONTEXT !== undefined) {
  after(async () => {
    await closeTrackedConnections();
  });
}
