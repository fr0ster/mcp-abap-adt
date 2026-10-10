import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Generate a self-signed certificate for testing purposes.
 * Uses openssl CLI (available on Linux/macOS).
 */
export function createSelfSignedCert(): {
  cert: string;
  key: string;
  dir: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tls-test-'));
  const certPath = path.join(dir, 'server.crt');
  const keyPath = path.join(dir, 'server.key');

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=localhost"`,
    { stdio: 'pipe' },
  );

  return { cert: certPath, key: keyPath, dir };
}
