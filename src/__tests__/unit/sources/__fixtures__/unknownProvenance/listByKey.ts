// A list read by key holds its elements, not its methods: a parsed list
// handed to a reader of rows is read at its elements.
type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowsOf(value: unknown): Row[] {
  return isRow(value) ? [value] : [];
}

export function fromParsed(text: string): Row[] {
  const parsed: unknown = JSON.parse(text);
  return rowsOf(Array.isArray(parsed) ? parsed : [parsed]);
}
