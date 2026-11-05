import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import { withoutNamePrefix } from '../plainText';
import { attr, child, childAt, isElement, isList } from '../xml/tree';
import { type AdtReading, parseStructure, reading } from './reading';

/**
 * What a data preview answers, read as a document rather than matched.
 *
 * **Why this is a strategy and not a function in the handler.** It was the
 * latter: `parseSqlQueryXml`, a set of regular expressions carried over from
 * before the migration, with the handler projecting `reading.raw` past the
 * injected result set so those expressions could keep running on the same
 * bytes. The reason given at the time was real — the shipped slot answers
 * `rawDocument`, the generic `structured` parse has never had
 * `dataPreview:columns`/`dataPreview:data` in its repeatable list, and no
 * document was in the corpus to design a parse against.
 *
 * What that reasoning missed is that "no data to design a better parse" does
 * not mean "the parse stays in the handler". A reading lives under the rules
 * every other reading lives under: it is injected per slot, and it is tested
 * against the corpus. Left in the handler it had neither, and the missing
 * fixture stayed an invisible assumption instead of a visible hole — which is
 * how a defect that reorders a caller's data survived a migration whose whole
 * point was to make readings replaceable. It was found by somebody else, on
 * their system: mpauspor in #179 and anggakharisma in #180, both against the
 * same regular expression.
 *
 * **The defect.** ADT sends a blank cell as a self-closing
 * `<dataPreview:data/>`, and `<dataPreview:data[^>]*>(.*?)</dataPreview:data>`
 * cannot match one. Each blank cell was therefore dropped from its column,
 * the column came back short, and every value below the first blank moved up
 * a row — attached to the wrong record, with nothing to say it had happened.
 * The same expression also matched `<dataPreview:dataSet>`, since `data`
 * needs a boundary after it (#180's finding).
 *
 * A parser has neither problem, and decodes entities besides — a cell holding
 * `&amp;` reached the caller as the escape until now. `I_Country` on the
 * trial system answers both cell shapes at once, 51 paired and 14
 * self-closing over 13 columns, and is in the corpus as
 * `read-sql-query-with-blank-cells`.
 */

export interface SqlColumn {
  name: string;
  type: string;
  description: string;
}

export interface SqlPreview {
  columns: SqlColumn[];
  /** One object per row, keyed by column name. A blank cell is `null`. */
  rows: Array<Record<string, string | null>>;
  /** `dataPreview:totalRows` — how many the query has, not how many came. */
  total_rows?: number;
  /** `dataPreview:queryExecutionTime`, in seconds as the server reports it. */
  execution_time?: number;
  /**
   * The whole document, parsed generically — what `detail: 'full'` answers.
   *
   * Not a hand-picked set of extra fields. I tried that first, adding
   * `executedQueryString` and `isHanaAnalyticalView` because review named
   * them, and review was right again: `keyAttribute`, `colType`,
   * `isKeyFigure` and anything SAP adds tomorrow were still being dropped,
   * while the answer went on calling itself the whole parse. A shaped
   * reading is the right answer for `terse`, where the point is the fields a
   * caller acts on; it is the wrong one for `full`, where the point is that
   * nothing was left out.
   *
   * This is the same `parseStructure` the generic `structured` reading uses —
   * the one the slot carried before `sqlPreview` replaced it — so `full`
   * answers exactly what it answered then, and the rows are correct beside
   * it.
   */
  document: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  // The column and its cells repeat; a document with one of either would
  // otherwise arrive as an object and be read as no columns at all.
  isArray: (name) => ['columns', 'data'].includes(withoutNamePrefix(name)),
  removeNSPrefix: true,
});

/** One element or several, as a list; a single value that is not an element is none. */
const asList = (value: unknown): readonly unknown[] =>
  isList(value) ? value : isElement(value) ? [value] : [];

/** The attribute `name` of `element`'s attribute group (`@`). */
const at = (element: unknown, name: string): string | undefined =>
  attr(child(element, '@'), name);

/**
 * A cell's text.
 *
 * `<data/>` parses to an empty string and `<data>AD</data>` to its text, so
 * the distinction that mattered to the regular expression does not arise
 * here — but an empty cell is still reported as `null` rather than `''`, so a
 * caller can tell "SAP sent nothing" from "SAP sent a blank string", which is
 * what the pre-migration answer did too.
 */
const cell = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const text = child(value, '#text');
    return text === undefined || text === '' ? null : String(text);
  }
  const text = String(value);
  return text === '' ? null : text;
};

const numberOf = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function parseSqlPreview(document: string): SqlPreview {
  const table = child(parser.parse(document), 'tableData');
  if (!table)
    return { columns: [], rows: [], document: parseStructure(document) };

  const columns: SqlColumn[] = [];
  const byColumn: Array<Array<string | null>> = [];

  for (const column of asList(child(table, 'columns'))) {
    const metadata = child(column, 'metadata');
    columns.push({
      name: at(metadata, 'name') ?? '',
      type: at(metadata, 'type') ?? '',
      description: at(metadata, 'description') ?? '',
    });
    // Each column carries its own `dataSet`, and the cells inside it are the
    // column's values in row order.
    byColumn.push(asList(childAt(column, 'dataSet', 'data')).map(cell));
  }

  // The longest column decides the row count: a column that came back short
  // is padded rather than silently shortening every row after it, which is
  // the failure this reading exists to end.
  const height = byColumn.reduce(
    (most, values) => Math.max(most, values.length),
    0,
  );
  const rows = Array.from({ length: height }, (_row, index) => {
    const row: Record<string, string | null> = {};
    columns.forEach((column, position) => {
      row[column.name] = byColumn[position]?.[index] ?? null;
    });
    return row;
  });

  return {
    columns,
    rows,
    total_rows: numberOf(child(table, 'totalRows')),
    execution_time: numberOf(child(table, 'queryExecutionTime')),
    document: parseStructure(document),
  };
}

/** The reading itself, for the `query` slot. */
export const sqlPreview: IResultStrategy<AdtReading<SqlPreview>> = reading(
  (answer) => parseSqlPreview(String(answer.data ?? '')),
);
