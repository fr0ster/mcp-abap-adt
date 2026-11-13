// A boundary narrowed in plain code: parsed text, the environment, a caught value.
function readName(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string'
  ) {
    return value.name;
  }
  return '';
}

export function fromText(text: string): string {
  return readName(JSON.parse(text));
}

export function fromEnvironment(): string {
  return readName(process.env.NAME);
}

export function caught(work: () => void): string {
  try {
    work();
    return '';
  } catch (error) {
    return readName(error);
  }
}
