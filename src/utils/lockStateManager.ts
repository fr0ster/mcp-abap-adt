/**
 * Lock State Manager - persists lock handles and session IDs to filesystem
 * Allows recovery and cleanup of locks after crashes or interruptions
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LockState {
  sessionId: string;
  lockHandle: string;
  objectType:
    | 'class'
    | 'interface'
    | 'program'
    | 'fm'
    | 'domain'
    | 'dataElement'
    | 'view'
    | 'table'
    | 'structure'
    | 'package';
  objectName: string;
  functionGroupName?: string; // Required for FM
  timestamp: number;
  pid: number;
  testFile?: string; // Which test file created this lock
}

export interface LockRegistry {
  locks: LockState[];
}

export class LockStateManager {
  private lockFilePath: string;
  private registry: LockRegistry;

  constructor(lockDir: string = '.locks') {
    // Create locks directory if it doesn't exist
    const baseDir = path.resolve(process.cwd(), lockDir);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.lockFilePath = path.join(baseDir, 'active-locks.json');
    this.registry = this.loadRegistry();
  }

  /**
   * Load lock registry from file
   */
  private loadRegistry(): LockRegistry {
    if (fs.existsSync(this.lockFilePath)) {
      try {
        const data = fs.readFileSync(this.lockFilePath, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.warn(`Failed to load lock registry: ${error}`);
        return { locks: [] };
      }
    }
    return { locks: [] };
  }

  /**
   * Save lock registry to file
   */
  private saveRegistry(): void {
    try {
      fs.writeFileSync(
        this.lockFilePath,
        JSON.stringify(this.registry, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error(`Failed to save lock registry: ${error}`);
    }
  }

  /**
   * Register a new lock
   */
  registerLock(lock: Omit<LockState, 'timestamp' | 'pid'>): void {
    const lockState: LockState = {
      ...lock,
      timestamp: Date.now(),
      pid: process.pid,
    };

    // Remove old lock for same object if exists
    this.registry.locks = this.registry.locks.filter(l =>
      !(l.objectType === lock.objectType &&
        l.objectName === lock.objectName &&
        l.functionGroupName === lock.functionGroupName)
    );

    this.registry.locks.push(lockState);
    this.saveRegistry();
  }

  /**
   * Remove lock from registry
   */
  removeLock(objectType: string, objectName: string, functionGroupName?: string): void {
    this.registry.locks = this.registry.locks.filter(l =>
      !(l.objectType === objectType &&
        l.objectName === objectName &&
        l.functionGroupName === functionGroupName)
    );
    this.saveRegistry();
  }

  /**
   * Get lock for specific object
   */
  getLock(objectType: string, objectName: string, functionGroupName?: string): LockState | undefined {
    return this.registry.locks.find(l =>
      l.objectType === objectType &&
      l.objectName === objectName &&
      l.functionGroupName === functionGroupName
    );
  }

  /**
   * Get all active locks
   */
  getAllLocks(): LockState[] {
    return [...this.registry.locks];
  }

  /**
   * Get stale locks (older than threshold)
   */
  getStaleLocks(maxAgeMs: number = 30 * 60 * 1000): LockState[] {
    const now = Date.now();
    return this.registry.locks.filter(l => now - l.timestamp > maxAgeMs);
  }

  /**
   * Get locks from dead processes
   */
  getDeadProcessLocks(): LockState[] {
    return this.registry.locks.filter(l => {
      try {
        // Check if process is still running
        process.kill(l.pid, 0);
        return false; // Process exists
      } catch (e) {
        return true; // Process doesn't exist
      }
    });
  }

  /**
   * Clean up stale locks
   */
  cleanupStaleLocks(maxAgeMs?: number): LockState[] {
    const staleLocks = this.getStaleLocks(maxAgeMs);
    const deadProcessLocks = this.getDeadProcessLocks();
    const toCleanup = [...new Set([...staleLocks, ...deadProcessLocks])];

    toCleanup.forEach(lock => {
      this.removeLock(lock.objectType, lock.objectName, lock.functionGroupName);
    });

    return toCleanup;
  }

  /**
   * Clear all locks
   */
  clearAll(): void {
    this.registry = { locks: [] };
    this.saveRegistry();
  }
}

// Global instance
let globalManager: LockStateManager | null = null;

export function getLockStateManager(lockDir?: string): LockStateManager {
  if (!globalManager) {
    globalManager = new LockStateManager(lockDir);
  }
  return globalManager;
}
