// Tool-argument input until it is checked: a value read out of a tool's
// arguments (`ToolArgValue`), a list of them, a nested object (`ToolArgs`),
// and a function that hands the same input on.
type ToolArgs = Readonly<Record<string, unknown>>;
type ToolArgValue = ToolArgs[string];

function member(value: ToolArgValue, name: string): ToolArgValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Reflect.get(value, name)
    : undefined;
}

function elementsOf(listed: readonly ToolArgValue[]): number {
  return listed.length;
}

function withoutRoute(args: ToolArgs): ToolArgs {
  const { route: _route, ...rest } = args;
  return rest;
}

export function readOut(args: ToolArgs): number {
  const nested = member(args.properties, 'name');
  const listed = args.items;
  return (
    elementsOf(Array.isArray(listed) ? listed : []) +
    Object.keys(withoutRoute(args)).length +
    (nested === undefined ? 0 : 1)
  );
}

// A value of no tool-argument type: refused.
function plain(value: unknown): boolean {
  return value === undefined;
}

export function asked(args: ToolArgs): boolean {
  return plain(args.name);
}
