// Containers of `unknown` and an alias of it, each fed by a typed value: the
// audit reads each position as it reads a plain `unknown`, and refuses all.
export interface Order {
  readonly id: string;
}

function countAll(items: unknown[]): number {
  return items.length;
}
export function fromOrders(orders: Order[]): number {
  return countAll(orders);
}

function keysOf(bag: Record<string, unknown>): string[] {
  return Object.keys(bag);
}
export function fromOrder(order: Order): string[] {
  return keysOf({ order });
}

function second(pair: readonly [unknown, string]): string {
  return pair[1];
}
export function fromPair(order: Order): string {
  return second([order, 'x']);
}

function sizeOf(map: ReadonlyMap<string, unknown>): number {
  return map.size;
}
export function fromMap(orders: Map<string, Order>): number {
  return sizeOf(orders);
}

function hasAny(set: ReadonlySet<unknown>): boolean {
  return set.size > 0;
}
export function fromSet(orders: Set<Order>): boolean {
  return hasAny(orders);
}

async function settle(work: Promise<unknown>): Promise<boolean> {
  return (await work) !== null;
}
export function fromPromise(order: Promise<Order>): Promise<boolean> {
  return settle(order);
}

function made(make: () => unknown): boolean {
  return make() !== null;
}
export function fromMaker(order: Order): boolean {
  return made(() => order);
}

function each(visit: (visited: unknown) => void, order: Order): void {
  visit(order);
}
export function fromVisitor(order: Order): void {
  each((visited) => void String(visited), order);
}

type Anything = unknown;
function viaAlias(aliased: Anything): boolean {
  return aliased !== null;
}
export function fromAlias(order: Order): boolean {
  return viaAlias(order);
}

export interface Holder {
  readonly held: readonly unknown[];
}
export function holder(order: Order): Holder {
  return { held: [order] };
}
