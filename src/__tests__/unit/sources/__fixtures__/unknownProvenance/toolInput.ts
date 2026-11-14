// A tool's arguments before their schema (`ToolArgs`): input, whoever hands
// them on — a typed object a route hands to an entry's `call` included.
type ToolArgs = Readonly<Record<string, unknown>>;

function call(args: ToolArgs): number {
  return Object.keys(args).length;
}

export function route(name: string): number {
  return call({ name });
}

// Intersected with a typed member the route selects by, still the input.
function routed(selected: { readonly kind?: string } & ToolArgs): number {
  return call(selected);
}

export function routeBy(name: string): number {
  return routed({ kind: 'x', name });
}

// Intersected with a member that itself holds unknown: no longer the input.
function widenedRoute(
  mixedIn: { readonly extra?: unknown } & ToolArgs,
): number {
  return call(mixedIn);
}

export function routeWidened(name: string): number {
  return widenedRoute({ extra: name, name });
}
