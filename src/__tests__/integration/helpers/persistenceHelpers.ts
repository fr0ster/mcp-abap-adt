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
  _extra: Record<string, any> = {},
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
    extra?: Record<string, any>;
  },
): SnapshotPaths {
  return {};
}

export function cleanupDiagnostics(
  _paths: SnapshotPaths,
  _testCase?: any,
): void {}

export function createDiagnosticsTracker(
  _testLabel: string,
  testCase?: any,
  _session?: SessionInfo | null,
  _extra: Record<string, any> = {},
) {
  return {
    persistLock(
      _lockSession?: SessionInfo | null,
      _lockHandle?: string | null,
      _objectInfo?: Record<string, any>,
    ) {
      // no-op (lock persistence removed)
    },
    cleanup() {
      cleanupDiagnostics({}, testCase);
    },
  };
}
