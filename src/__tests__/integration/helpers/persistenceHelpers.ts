type SessionState = {
  cookies?: string;
  csrf_token?: string;
  cookie_store?: unknown;
  [key: string]: unknown;
};

type SessionInfo = {
  session_id: string;
  session_state: SessionState;
};

type SnapshotPaths = {
  sessionPath?: string;
};

/**
 * Session persistence has been removed from this package.
 * Keep no-op helpers so tests can reuse existing hooks without filesystem state.
 */
export function saveSessionSnapshot(
  _testLabel: string,
  _session: SessionInfo,
  _extra: Record<string, unknown> = {},
): SnapshotPaths {
  return {};
}

export function cleanupSessionSnapshot(
  _snapshotPath: string | undefined,
  _shouldCleanup: boolean,
) {}

export function persistDiagnostics(
  _testLabel: string,
  _opts: {
    session?: SessionInfo | null;
    extra?: Record<string, unknown>;
  },
): SnapshotPaths {
  return {};
}

export function cleanupDiagnostics(
  _paths: SnapshotPaths,
  _testCase?: unknown,
): void {}

export function createDiagnosticsTracker(
  _testLabel: string,
  testCase?: unknown,
  _session?: SessionInfo | null,
  _extra: Record<string, unknown> = {},
) {
  return {
    persistLock(
      _lockSession?: SessionInfo | null,
      _lockHandle?: string | null,
      _objectInfo?: Record<string, unknown>,
    ) {
      // no-op (lock persistence removed)
    },
    cleanup() {
      cleanupDiagnostics({}, testCase);
    },
  };
}
