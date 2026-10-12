/**
 * A debug session's breakpoints as one set. `setBreakpoints` without
 * `syncScope` replaces the key's whole set — a `validationOnly` request too
 * (measured on premise (2026-10-11), BASIS 816) — so every change sends the
 * definitions kept so far with the new ones.
 *
 * Each definition carries a tag of the session's, sent as its `clientId`. The
 * system echoes the tag on every answer row, placed and refused alike, answers
 * the rows out of the request's order (the refused ones first) and renumbers
 * the ids (measured on premise (2026-10-11), BASIS 816): the tag is the only
 * thing that pairs a row with its definition. A placed line row also echoes
 * its URI, possibly rewritten, and its condition; neither is used to pair. A
 * row that carries no tag of the request is reported, never paired by guess.
 */
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import { type BreakpointReading, breakpointKey } from './readings';

/** A definition as the caller gave it, with the session's tag for it. */
export interface RequestedBreakpoint {
  /** `bp` and the session's counter: never reused within a session instance. */
  clientId: string;
  definition: IDebuggerBreakpoint;
}

/** A definition the system did not place, with the reason its row gave. */
export interface BreakpointNotPlaced {
  requested: IDebuggerBreakpoint;
  error?: string;
}

/**
 * An answer row no definition of the request pairs with: no tag, a tag this
 * request did not send, or a second row for a tag already answered. A
 * conforming system sends none.
 */
export interface UnexpectedRow {
  kind: string;
  id?: string;
  clientId?: string;
  error?: string;
}

/** Kind, target and condition: what makes two definitions the same. */
export function definitionKey(b: IDebuggerBreakpoint): string {
  const condition = b.kind === 'line' ? (b.condition ?? '') : '';
  return `${breakpointKey(b)}|${condition}`;
}

/**
 * The kept definitions with their tags, then each new one with the next tag;
 * each definition once. `nextTag` is called only for a definition not kept.
 */
export function mergeDefinitions(
  kept: readonly RequestedBreakpoint[],
  added: readonly IDebuggerBreakpoint[],
  nextTag: () => string,
): RequestedBreakpoint[] {
  const merged = new Map<string, RequestedBreakpoint>();
  for (const r of kept) {
    const key = definitionKey(r.definition);
    if (!merged.has(key)) merged.set(key, r);
  }
  for (const b of added) {
    const key = definitionKey(b);
    if (!merged.has(key))
      merged.set(key, { clientId: nextTag(), definition: b });
  }
  return [...merged.values()];
}

/**
 * The row as it is sent: the definition with the session's tag. The tag is
 * set last, so a `clientId` the definition brought never goes out.
 */
export function wireOf(r: RequestedBreakpoint): IDebuggerBreakpoint {
  return { ...r.definition, clientId: r.clientId };
}

export interface Pairing {
  /** The definitions placed, with their tags: what the next change sends again. */
  requested: RequestedBreakpoint[];
  /** A paired placed row's id → its definition's tag. */
  paired: Map<string, string>;
  /** Every placed row of the answer, an unexpected one included: the system holds it. */
  placed: BreakpointReading[];
  /** New definitions not placed. */
  refused: BreakpointNotPlaced[];
  /** Earlier definitions not placed any more. */
  lost: BreakpointNotPlaced[];
  /** Rows that pair with no definition. */
  unexpected: UnexpectedRow[];
}

/**
 * Pairs the rows of one answer with the definitions sent, by the echoed tag
 * alone. A row answers the definition its tag names: placed with an id,
 * refused without one. A definition no row answers was not placed, without a
 * reason. A row that pairs with nothing is `unexpected`; a placed one of them
 * is still in `placed`, because the system holds it under the key.
 */
export function pairRows(
  sent: readonly RequestedBreakpoint[],
  earlier: ReadonlySet<string>,
  rows: readonly BreakpointReading[],
): Pairing {
  const byTag = new Map(sent.map((r) => [r.clientId, r]));
  const answered = new Map<string, BreakpointReading>();
  const result: Pairing = {
    requested: [],
    paired: new Map(),
    placed: rows.filter((r) => r.id),
    refused: [],
    lost: [],
    unexpected: [],
  };
  for (const row of rows) {
    const tag = row.clientId;
    if (tag === undefined || !byTag.has(tag) || answered.has(tag)) {
      result.unexpected.push({
        kind: row.kind,
        ...(row.id ? { id: row.id } : {}),
        ...(tag !== undefined ? { clientId: tag } : {}),
        ...(row.error ? { error: row.error } : {}),
      });
      continue;
    }
    answered.set(tag, row);
  }
  for (const r of sent) {
    const row = answered.get(r.clientId);
    if (row?.id) {
      result.requested.push(r);
      result.paired.set(row.id, r.clientId);
      continue;
    }
    const entry: BreakpointNotPlaced = row?.error
      ? { requested: r.definition, error: row.error }
      : { requested: r.definition };
    (earlier.has(r.clientId) ? result.lost : result.refused).push(entry);
  }
  return result;
}
