/**
 * Lock State Manager - persists lock handles and session IDs to filesystem
 * Allows recovery and cleanup of locks after crashes or interruptions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AdtObjectType } from '@mcp-abap-adt/adt-clients';

const OBJECT_TYPE_NORMALIZATION_MAP: Record<string, AdtObjectType> = {
  class: 'class',
  'clas/oc': 'clas/oc',
  program: 'program',
  'prog/p': 'prog/p',
  interface: 'interface',
  'intf/if': 'intf/if',
  fm: 'functionmodule',
  functionmodule: 'functionmodule',
  fugr: 'functiongroup',
  'fugr/ff': 'fugr/ff',
  functiongroup: 'functiongroup',
  view: 'view',
  'ddls/df': 'ddls/df',
  structure: 'structure',
  'stru/dt': 'stru/dt',
  table: 'table',
  'tabl/dt': 'tabl/dt',
  tabletype: 'tabletype',
  'ttyp/df': 'ttyp/df',
  domain: 'domain',
  'doma/dd': 'doma/dd',
  dataelement: 'dataelement',
  dtel: 'dtel',
  package: 'package',
  'devc/k': 'devc/k',
};

export function normalizeLockObjectType(objectType: string): AdtObjectType {
  const normalized = OBJECT_TYPE_NORMALIZATION_MAP[objectType.toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported object type for lock registry: ${objectType}`);
  }
  return normalized;
}

export interface LockState {
  sessionId: string;
  lockHandle: string;
  objectType: AdtObjectType;
  objectName: string;
  functionGroupName?: string; // Required for FM
  timestamp: number;
  pid: number;
  testFile?: string; // Which test file created this lock
}

type RawLockState = Omit<LockState, 'objectType'> & { objectType: string };

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
        const parsed = JSON.parse(data) as LockRegistry;
        const locks = Array.isArray(parsed?.locks) ? parsed.locks : [];
        const normalizedLocks = locks
          .map((lock) => this.normalizeLock(lock))
          .filter(Boolean) as LockState[];

        return { locks: normalizedLocks };
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
        'utf-8',
      );
    } catch (error) {
      console.error(`Failed to save lock registry: ${error}`);
    }
  }

  /**
   * Register a new lock
   */
  registerLock(lock: Omit<RawLockState, 'timestamp' | 'pid'>): void {
    const normalizedType = normalizeLockObjectType(lock.objectType);
    const lockState: LockState = {
      ...lock,
      objectType: normalizedType,
      timestamp: Date.now(),
      pid: process.pid,
    };

    // Remove old lock for same object if exists
    this.registry.locks = this.registry.locks.filter(
      (l) =>
        !(
          l.objectType === normalizedType &&
          l.objectName === lock.objectName &&
          l.functionGroupName === lock.functionGroupName
        ),
    );

    this.registry.locks.push(lockState);
    this.saveRegistry();
  }

  /**
   * Remove lock from registry
   */
  removeLock(
    objectType: string,
    objectName: string,
    functionGroupName?: string,
  ): void {
    const normalizedType = normalizeLockObjectType(objectType);
    this.registry.locks = this.registry.locks.filter(
      (l) =>
        !(
          l.objectType === normalizedType &&
          l.objectName === objectName &&
          l.functionGroupName === functionGroupName
        ),
    );
    this.saveRegistry();
  }

  /**
   * Get lock for specific object
   */
  getLock(
    objectType: string,
    objectName: string,
    functionGroupName?: string,
  ): LockState | undefined {
    const normalizedType = normalizeLockObjectType(objectType);
    return this.registry.locks.find(
      (l) =>
        l.objectType === normalizedType &&
        l.objectName === objectName &&
        l.functionGroupName === functionGroupName,
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
    return this.registry.locks.filter((l) => now - l.timestamp > maxAgeMs);
  }

  /**
   * Get locks from dead processes
   */
  getDeadProcessLocks(): LockState[] {
    return this.registry.locks.filter((l) => {
      try {
        // Check if process is still running
        process.kill(l.pid, 0);
        return false; // Process exists
      } catch (_e) {
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

    toCleanup.forEach((lock) => {
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

  /**
   * Normalize a lock loaded from disk to canonical ADT object type
   */
  private normalizeLock(lock: RawLockState): LockState | null {
    try {
      return {
        ...lock,
        objectType: normalizeLockObjectType(lock.objectType),
      };
    } catch (error) {
      console.warn(
        `Skipping lock with unknown object type "${lock.objectType}": ${error}`,
      );
      return null;
    }
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
