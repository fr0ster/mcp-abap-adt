/**
 * §9: the launcher's last line, when `main()` rejects, carries fixed words and
 * auth-errors' `logFields` of what the value classifies as — never its
 * message, stack or string form.
 */

import {
  AuthProviderFailure,
  authError,
  logFields,
} from '@mcp-abap-adt/auth-errors';
import { launcherFailedLine } from '../launcher';

const SECRET = 'SECRET-IN-A-MESSAGE-9';

it('an error of no known shape: the fixed unknown fields, nothing of the message', () => {
  const thrown = new Error(`could not parse "${SECRET}"`);
  expect(launcherFailedLine(thrown)).toBe(
    `[MCP] launcher failed: ${JSON.stringify(
      logFields(authError.unknown({ operation: 'unfamiliar-error' })),
    )}`,
  );
  expect(launcherFailedLine(thrown)).not.toContain(SECRET);
  expect(launcherFailedLine(SECRET)).not.toContain(SECRET);
});

it('a chain failure: its logFields', () => {
  const error = authError['credential-refused']({ credential: 'token' });
  expect(launcherFailedLine(new AuthProviderFailure(error))).toBe(
    `[MCP] launcher failed: ${JSON.stringify(logFields(error))}`,
  );
});
