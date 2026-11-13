// An awaited value: `show` receives what the promise holds, parsed text, not
// the promise.
async function produce(text: string): Promise<unknown> {
  return JSON.parse(text);
}

function show(value: unknown): string {
  return String(value);
}

export async function run(text: string): Promise<string> {
  return show(await produce(text));
}
