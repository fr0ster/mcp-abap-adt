/**
 * The ATC results the system holds, read from what SAP answers.
 *
 * Measured on premise and on the cloud trial (2026-11-02):
 * `/atc/results` answers `atcresult:resultList` of `atcresult:result`, each with
 * `displayId`, `title`, `checkVariant`, `runSeries` (empty when none),
 * `createdAt` and `aggregates` (`numPrio1`…`numPrio4`, `numFailure`);
 * `/atc/results/{displayId}` answers the same list holding one result that
 * also carries `objects`, below which it is a worklist's. That result's own
 * `aggregates` read zero while it holds findings, so its counts are the
 * findings' (`readAtcObjects`), the same as `GetATCFindings` answers.
 */
import {
  type AtcFindingFull,
  atcElements,
  type Element,
  parseAtcDocument,
  readAtcObjects,
} from './atcFindings';

/** One entry of the result list. */
export interface AtcResultEntry {
  display_id: string;
  title?: string;
  check_variant?: string;
  /** Absent when SAP sent it empty. */
  run_series?: string;
  created_at?: string;
  /** `numPrio1`…`numPrio4`, keyed by the priority as a string. */
  by_priority?: Record<string, number>;
  /** `numFailure`. */
  failures?: number;
}

export interface AtcResultListReading {
  results: AtcResultEntry[];
}

/** One result by its Display ID, its findings as `GetATCFindings` reads them. */
export interface AtcResultReading {
  display_id: string;
  title?: string;
  check_variant?: string;
  created_at?: string;
  objects_checked: number;
  by_priority: Record<string, number>;
  findings: AtcFindingFull[];
}

/** The text of a child element, absent when it is missing or empty. */
function childText(element: Element, name: string): string | undefined {
  const value = element[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A child element's text as a whole number, absent when it is not one. */
function childNumber(element: Element, name: string): number | undefined {
  const text = childText(element, name);
  if (text === undefined) return undefined;
  for (const character of text) {
    if (character < '0' || character > '9') return undefined;
  }
  return Number(text);
}

/** The `result` elements of a `resultList`, prefixes removed. */
function resultElements(document: string): Element[] {
  const [root] = atcElements(parseAtcDocument(document));
  if (root === undefined) return [];
  const [list] = atcElements(root.resultList);
  if (list === undefined) return [];
  return atcElements(list.result);
}

function aggregates(result: Element): Record<string, number> | undefined {
  const [element] = atcElements(result.aggregates);
  if (element === undefined) return undefined;
  const counts: Record<string, number> = {};
  for (const priority of ['1', '2', '3', '4']) {
    const count = childNumber(element, `numPrio${priority}`);
    if (count !== undefined) counts[priority] = count;
  }
  return counts;
}

function entryOf(result: Element): AtcResultEntry {
  const [aggregate] = atcElements(result.aggregates);
  return {
    display_id: childText(result, 'displayId') ?? '',
    title: childText(result, 'title'),
    check_variant: childText(result, 'checkVariant'),
    ...(childText(result, 'runSeries') !== undefined && {
      run_series: childText(result, 'runSeries'),
    }),
    created_at: childText(result, 'createdAt'),
    by_priority: aggregates(result),
    failures:
      aggregate === undefined
        ? undefined
        : childNumber(aggregate, 'numFailure'),
  };
}

export function parseAtcResultList(document: string): AtcResultListReading {
  return { results: resultElements(document).map(entryOf) };
}

export function parseAtcResult(document: string): AtcResultReading {
  const [result] = resultElements(document);
  if (result === undefined) {
    return {
      display_id: '',
      objects_checked: 0,
      by_priority: {},
      findings: [],
    };
  }
  const { findings, objects_checked, by_priority } = readAtcObjects(
    result.objects,
  );
  return {
    display_id: childText(result, 'displayId') ?? '',
    title: childText(result, 'title'),
    check_variant: childText(result, 'checkVariant'),
    created_at: childText(result, 'createdAt'),
    objects_checked,
    by_priority,
    findings,
  };
}
