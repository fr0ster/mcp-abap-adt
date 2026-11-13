// A tool's arguments before their schema (`ToolArgs`): input, whoever hands
// them on — a typed object a route hands to an entry's `call` included.
type ToolArgs = Readonly<Record<string, unknown>>;

function call(args: ToolArgs): number {
  return Object.keys(args).length;
}

export function route(name: string): number {
  return call({ name });
}
