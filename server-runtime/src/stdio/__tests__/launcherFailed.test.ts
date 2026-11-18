/**
 * The launcher's last line, when `main()` rejects, carries fixed words and
 * auth-errors' `logFields` of what the value classifies as — never its
 * message, stack or string form.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  AuthProviderFailure,
  authError,
  logFields,
} from '@mcp-abap-adt/auth-errors';
import { launcherFailedLine } from '../launcher';

const SECRET = 'SECRET-IN-A-MESSAGE-9';

it('an error of no known shape: the fixed unknown fields, nothing of the message', () => {
  const thrown = new Error(`could not parse "${SECRET}"`);
  assert.equal(
    launcherFailedLine(thrown),
    `[MCP] launcher failed: ${JSON.stringify(
      logFields(authError.unknown({ operation: 'unfamiliar-error' })),
    )}`,
  );
  assert.ok(!launcherFailedLine(thrown).includes(SECRET));
  assert.ok(!launcherFailedLine(SECRET).includes(SECRET));
});

it('a chain failure: its logFields', () => {
  const error = authError['credential-refused']({ credential: 'token' });
  assert.equal(
    launcherFailedLine(new AuthProviderFailure(error)),
    `[MCP] launcher failed: ${JSON.stringify(logFields(error))}`,
  );
});
