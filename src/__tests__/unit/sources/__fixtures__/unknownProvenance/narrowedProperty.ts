// A property a contract types `unknown`, narrowed before it is handed on:
// `!== undefined` makes it `{} | null`, still no contract of its own. The
// contract reaches it through a mapped type (`Omit`), as a wire answer does.
interface Wire {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

interface Answer extends Omit<Wire, 'headers'> {
  headers: Record<string, string | string[]>;
}

function clip(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function shown(answer: Answer): string {
  return answer.data !== undefined ? clip(answer.data) : '';
}

export function received(text: string): Answer {
  return { status: 200, headers: {}, data: JSON.parse(text) };
}
