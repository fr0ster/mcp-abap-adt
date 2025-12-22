import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getCleanupAfter,
  getLockConfig,
  getSessionConfig,
} from './configHelpers';

type SessionState = {
  cookies?: string;
  csrf_token?: string;
  cookie_store?: any;
  [key: string]: any;
};

type SessionInfo = {
  session_id: string;
  session_state: SessionState;
};

type ObjectInfo = {
  object_type?: string;
  object_name?: string;
  transport_request?: string;
};

type SnapshotPaths = {
  sessionPath?: string;
  lockPath?: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encodeMaybe(value: any): { raw?: any; base64?: string } {
  // Encode only objects/strings that may be large
  if (value === undefined || value === null) {
    return {};
  }
  try {
    const rawString = typeof value === 'string' ? value : JSON.stringify(value);
    // Encode if longer than threshold
    if (rawString.length > 1024) {
      return { base64: Buffer.from(rawString, 'utf8').toString('base64') };
    }
    return { raw: value };
  } catch {
    return { raw: value };
  }
}

/**
 * Save session snapshot for diagnostics
 */
export function saveSessionSnapshot(
  testLabel: string,
  session: SessionInfo,
  extra: Record<string, any> = {},
): SnapshotPaths {
  const cfg = getSessionConfig();
  if (cfg.persist_session === false) {
    return {};
  }
  const dir = path.resolve(process.cwd(), cfg.sessions_dir || '.sessions');
  ensureDir(dir);

  const fileName = `${safeName(testLabel)}_${safeName(session.session_id)}_${Date.now()}.json`;
  const filePath = path.join(dir, fileName);

  const payload: any = {
    type: 'session_snapshot',
    created_at: new Date().toISOString(),
    test_label: testLabel,
    session_id: session.session_id,
    session_state: {
      cookies: session.session_state?.cookies || '',
      csrf_token: session.session_state?.csrf_token || '',
      cookie_store: encodeMaybe(session.session_state?.cookie_store),
    },
    extra,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { sessionPath: filePath };
}

/**
 * Save lock snapshot for diagnostics
 */
export function saveLockSnapshot(
  testLabel: string,
  objectInfo: ObjectInfo,
  lockHandle: string | undefined | null,
  session: SessionInfo | null,
): SnapshotPaths {
  const cfg = getLockConfig();
  if (cfg.persist_locks === false) {
    return {};
  }
  const dir = path.resolve(process.cwd(), cfg.locks_dir || '.locks');
  ensureDir(dir);

  const fileName = `${safeName(testLabel)}_${safeName(objectInfo.object_name || 'unknown')}_${Date.now()}.json`;
  const filePath = path.join(dir, fileName);

  const payload: any = {
    type: 'lock_snapshot',
    created_at: new Date().toISOString(),
    test_label: testLabel,
    object: {
      type: objectInfo.object_type,
      name: objectInfo.object_name,
      transport_request: objectInfo.transport_request,
    },
    lock_handle: lockHandle || null,
  };

  if (session) {
    payload.session_id = session.session_id;
    payload.session_state = {
      cookies: session.session_state?.cookies || '',
      csrf_token: session.session_state?.csrf_token || '',
      cookie_store: encodeMaybe(session.session_state?.cookie_store),
    };
  }

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { lockPath: filePath };
}

/**
 * Cleanup session snapshot if policy allows
 */
export function cleanupSessionSnapshot(
  snapshotPath: string | undefined,
  shouldCleanup: boolean,
) {
  if (!snapshotPath) return;
  const cfg = getSessionConfig();
  if (cfg.cleanup_session_after_test !== true) {
    return;
  }
  if (!shouldCleanup) {
    return;
  }
  try {
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  } catch {
    // best effort cleanup
  }
}

/**
 * Convenience helper to persist session and lock snapshots for a test.
 */
export function persistDiagnostics(
  testLabel: string,
  opts: {
    session?: SessionInfo | null;
    lockHandle?: string | null;
    objectInfo?: ObjectInfo;
    extra?: Record<string, any>;
  },
): SnapshotPaths {
  const paths: SnapshotPaths = {};
  if (opts.session) {
    const { sessionPath } = saveSessionSnapshot(
      testLabel,
      opts.session,
      opts.extra || {},
    );
    paths.sessionPath = sessionPath;
  }

  if (opts.lockHandle && opts.objectInfo) {
    const { lockPath } = saveLockSnapshot(
      testLabel,
      opts.objectInfo,
      opts.lockHandle,
      opts.session || null,
    );
    paths.lockPath = lockPath;
  }

  return paths;
}

/**
 * Convenience helper to cleanup persisted diagnostics according to policy.
 */
export function cleanupDiagnostics(paths: SnapshotPaths, testCase?: any): void {
  const shouldCleanup =
    getCleanupAfter(testCase) &&
    getSessionConfig().cleanup_session_after_test === true;
  cleanupSessionSnapshot(paths.sessionPath, shouldCleanup);
  // Lock files are retained unless an explicit policy is added; no removal here.
}

/**
 * Tracker factory to simplify diagnostics persistence across tests.
 * Persists session immediately (if provided) and exposes persistLock/cleanup helpers.
 */
export function createDiagnosticsTracker(
  testLabel: string,
  testCase?: any,
  session?: SessionInfo | null,
  extra: Record<string, any> = {},
) {
  let paths: SnapshotPaths = {};

  if (session) {
    paths = persistDiagnostics(testLabel, {
      session,
      extra: {
        ...extra,
        test_case: testCase?.name,
      },
    });
  }

  return {
    persistLock(
      lockSession?: SessionInfo | null,
      lockHandle?: string | null,
      objectInfo?: ObjectInfo,
    ) {
      if (!lockHandle || !objectInfo) return;
      paths = {
        ...paths,
        ...persistDiagnostics(testLabel, {
          session: lockSession || session || null,
          lockHandle,
          objectInfo,
        }),
      };
    },
    cleanup() {
      cleanupDiagnostics(paths, testCase);
    },
  };
}
