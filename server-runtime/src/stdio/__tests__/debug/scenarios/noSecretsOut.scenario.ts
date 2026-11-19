/**
 * Plain-node scenario (`plainNode.ts`, `runScenarioOutput`) for
 * `noSecretsOut.test.ts`: one login stand in a process of its own, so the
 * test owns that process's stdout and stderr as a client does. The case
 * (the first argument) is a refused token request (a secret marker in the
 * server's `error_description`) or a successful login, with or without
 * `--auth-debug` (`refused`, `refused-debug`, `login`, `login-debug`). One
 * tool call; then the stand is closed and the report — the answer, every
 * surface the stand captured, and the secrets the stand made (the
 * authorization URLs, the tokens issued) — is the one line this process
 * writes on stdout. Nothing else may reach it.
 */
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  recordUnhandled,
  report,
} from '../../../../../../src/__tests__/helpers/plainNodeRecorder';
import { stand } from '../../helpers/loginStand';

const MARKER = 'description-marker-5d2e8b17c9';
const CLIENT_SECRET = 'cs-0123456789-abcdefghij-ZZ';

async function main(): Promise<void> {
  recordUnhandled();
  const which = process.argv[2] ?? '';
  const refused = which.startsWith('refused');
  const authDebug = which.endsWith('-debug');
  const loggerLines: string[] = [];
  /** What `--auth-debug` makes the launcher's logger: every line to stderr. */
  const stderrLogger = (): ILogger => {
    const write = (line: unknown, meta?: unknown) => {
      const text = `${String(line)}${meta === undefined ? '' : ` ${JSON.stringify(meta)}`}`;
      loggerLines.push(text);
      process.stderr.write(`${text}\n`);
    };
    return { info: write, warn: write, error: write, debug: write };
  };
  const s = await stand({
    kind: 'cloud',
    auth: 'jwt',
    clientSecret: CLIENT_SECRET,
    ...(authDebug && { authDebug: true, logger: stderrLogger() }),
  });
  if (refused) s.tokens.refuseCodes(MARKER);
  const answer = await s.callTool('ProbeAdt', {
    id: refused ? 'REFUSED' : 'OK',
  });
  await s.close();
  report({
    answer,
    urls: [...s.browser.urls],
    issued: [...s.tokens.issued],
    stderr: s.stderr.join(''),
    logger: loggerLines.join('\n'),
    http: s.browser.answers.join('\n'),
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `the scenario failed: ${error instanceof Error ? error.name : 'value'}\n`,
  );
  process.exit(1);
});
