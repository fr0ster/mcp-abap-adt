/**
 * Runs after every test file (jest `setupFilesAfterEnv`): whatever connections
 * the file opened through the helpers are disconnected, so their HTTP sessions
 * end with a logoff instead of waiting out the server's timeout. A unit test
 * file opens none, and this does nothing there.
 */
import { closeTrackedConnections } from './openConnections';

afterAll(async () => {
  await closeTrackedConnections();
});
