const connectionResetHooks = new Set<() => void>();

export function registerConnectionResetHook(hook: () => void) {
  connectionResetHooks.add(hook);
}

export function notifyConnectionResetListeners() {
  for (const hook of connectionResetHooks) {
    try {
      hook();
    } catch {
      // Hooks are best-effort only; errors are intentionally swallowed
    }
  }
}

export function clearConnectionResetHooks() {
  connectionResetHooks.clear();
}
