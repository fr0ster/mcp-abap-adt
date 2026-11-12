/**
 * The call-time lists (spec §2.2): allowed packages, allowed requests, and
 * denied or allowed tables. Entries are upper-cased at start. Plain code, no
 * regular expression.
 */
import { ParameterRefusal } from '../config/authParameters.js';
import type { DeniedActions } from './deniedActions.js';

/** An allowed-packages entry: a name, a prefix (`Z*`) or a subtree (`ZFOO/**`). */
export type PackageEntry = {
  readonly kind: 'exact' | 'prefix' | 'subtree';
  readonly name: string;
};

/** A request or table entry: a name, or a prefix (`A4HK*`). */
export type NameEntry = {
  readonly kind: 'exact' | 'prefix';
  readonly name: string;
};

/** The call-time lists a start configured; a list not configured is absent. */
export interface AccessLists {
  readonly allowedPackages?: readonly PackageEntry[];
  readonly allowedRequests?: readonly NameEntry[];
  readonly deniedTables?: readonly NameEntry[];
  readonly allowedTables?: readonly NameEntry[];
}

/** Every restriction a start configured. */
export interface AccessRestrictions {
  readonly deniedActions: DeniedActions;
  readonly lists: AccessLists;
}

function isLetterOrDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

/** Letters, digits, `_`, `/` and `$`: a package's or a table's characters. */
function objectNameCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (!isLetterOrDigit(code) && code !== 95 && code !== 47 && code !== 36) {
      return false;
    }
  }
  return true;
}

function lettersAndDigits(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!isLetterOrDigit(text.charCodeAt(i))) return false;
  }
  return true;
}

function refused(name: string, text: string, why: string): ParameterRefusal {
  return new ParameterRefusal(`Invalid ${name} entry "${text}": ${why}`);
}

/** A name or a prefix whose characters `valid` admits; `*` only at the end. */
function nameEntry(
  text: string,
  name: string,
  valid: (body: string) => boolean,
  characters: string,
): NameEntry {
  if (text.length === 0) throw refused(name, text, 'an entry is empty');
  const prefix = text.endsWith('*');
  const body = prefix ? text.slice(0, -1) : text;
  if (body.length === 0) throw refused(name, text, 'a prefix names no text');
  if (!valid(body)) {
    throw refused(
      name,
      text,
      `an entry holds ${characters} only, and "*" only at its end`,
    );
  }
  return { kind: prefix ? 'prefix' : 'exact', name: body.toUpperCase() };
}

const SUBTREE = '/**';

/** One allowed-packages entry, as given in the form `name`. */
export function parsePackageEntry(text: string, name: string): PackageEntry {
  if (text.endsWith(SUBTREE)) {
    const body = text.slice(0, -SUBTREE.length);
    if (body.length === 0) {
      throw refused(name, text, 'a subtree names no package');
    }
    if (!objectNameCharacters(body)) {
      throw refused(
        name,
        text,
        'a subtree is a package name followed by "/**": ASCII letters, digits, "_", "/" and "$", no "*"',
      );
    }
    return { kind: 'subtree', name: body.toUpperCase() };
  }
  return nameEntry(
    text,
    name,
    objectNameCharacters,
    'ASCII letters, digits, "_", "/" and "$"',
  );
}

/** One allowed-requests entry, as given in the form `name`. */
export function parseRequestEntry(text: string, name: string): NameEntry {
  return nameEntry(text, name, lettersAndDigits, 'ASCII letters and digits');
}

/** One denied- or allowed-tables entry, as given in the form `name`. */
export function parseTableEntry(text: string, name: string): NameEntry {
  return nameEntry(
    text,
    name,
    objectNameCharacters,
    'ASCII letters, digits, "_", "/" and "$"',
  );
}
