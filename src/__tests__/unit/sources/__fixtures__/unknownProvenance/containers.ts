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

// Written into after it is made: a mutator, an element, a member.
export function pushed(order: Order): number {
  const into: unknown[] = [];
  into.push(order);
  return into.length;
}
export function assigned(order: Order): number {
  const slots: [unknown] = [undefined];
  slots[0] = order;
  const members: Record<string, unknown> = {};
  members.order = order;
  return slots.length + Object.keys(members).length;
}
export function stored(order: Order): number {
  const entries: Map<string, unknown> = new Map();
  entries.set('x', order);
  const kept: Set<unknown> = new Set();
  kept.add(order);
  return entries.size + kept.size;
}

// An interface's index signature, and a library call widened by its
// written type argument.
interface Bag {
  [key: string]: unknown;
}
export function viaInterface(order: Order): Bag {
  const indexed: Bag = { order };
  return indexed;
}
export function widened(order: Order): Promise<unknown> {
  const promised: Promise<unknown> = Promise.resolve<unknown>(order);
  return promised;
}

// A spread's elements, a map's key, a nested receiver, a write through an
// alias, and an inherited index signature.
export function spreadInto(order: Order): number {
  const spread: unknown[] = [];
  spread.push(...[order]);
  return spread.length;
}
export function keyed(order: Order): number {
  const keys: Map<unknown, string> = new Map();
  keys.set(order, 'x');
  return keys.size;
}
export function nested(order: Order): number {
  const rows: unknown[][] = [[]];
  rows[0]?.push(order);
  return rows.length;
}
export function throughAlias(order: Order): number {
  const heldOrders: unknown[] = [];
  const alias = heldOrders;
  alias.push(order);
  return heldOrders.length;
}
interface BaseBag {
  [key: string]: unknown;
}
interface DerivedBag extends BaseBag {}
export function inherited(order: Order): DerivedBag {
  const derived: DerivedBag = { order };
  return derived;
}

// Made by a library constructor from values, written through a generic
// alias or an indexed alias, spread into a call, keyed by number.
export function constructed(order: Order): number {
  const made: Map<string, unknown> = new Map<string, unknown>([['x', order]]);
  const grouped: Set<unknown> = new Set<unknown>([order]);
  const resolved: Promise<unknown> = new Promise<unknown>((resolve) =>
    resolve(order),
  );
  return made.size + grouped.size + (resolved === undefined ? 0 : 1);
}
type Values<T> = T[];
export function genericAlias(order: Order): number {
  const listed: Values<unknown> = [order];
  return listed.length;
}
export function indexedAlias(order: Order): number {
  const table: unknown[][] = [[]];
  const row = table[0];
  row?.push(order);
  return table.length;
}
function take(spreadInto: unknown[]): number {
  return spreadInto.length;
}
export function spreadCall(order: Order): number {
  const args: [Order[]] = [[order]];
  return take(...args);
}
export function numbered(order: Order): number {
  const orders: Record<number, Order> = { 0: order };
  const byNumber: Record<number, unknown> = orders;
  return Object.keys(byNumber).length;
}

// An argument after a tuple spread, a generic interface's index signature,
// and a Promise resolver copied to another name.
function takeOne(afterSpread: unknown): boolean {
  return afterSpread !== null;
}
export function afterTuple(order: Order): boolean {
  const none: [] = [];
  return takeOne(...none, order);
}
interface TaggedBag<Tag> {
  tag?: Tag;
  [key: string]: unknown;
}
export function genericInterface(order: Order): TaggedBag<string> {
  const tagged: TaggedBag<string> = { order };
  return tagged;
}
export function copiedResolver(order: Order): Promise<unknown> {
  const finished: Promise<unknown> = new Promise<unknown>((resolve) => {
    const finish = resolve;
    finish(order);
  });
  return finished;
}

// An inherited generic index signature made unknown by its argument, a
// generic function type's parameter, a rest parameter's later arguments,
// and a map or set filled through a tuple spread.
interface ValueBag<T> {
  [key: string]: T;
}
interface DerivedValueBag<T> extends ValueBag<T> {}
export function inheritedGeneric(order: Order): DerivedValueBag<unknown> {
  const inheritedValues: DerivedValueBag<unknown> = { order };
  return inheritedValues;
}
type Visit<T> = (value: T) => void;
function eachVisit(visit: Visit<unknown>, order: Order): void {
  visit(order);
}
export function genericVisitor(order: Order): void {
  eachVisit((genericVisited) => void String(genericVisited), order);
}
function takeAll(...restItems: unknown[]): number {
  return restItems.length;
}
export function restCall(order: Order): number {
  // The second argument and on are the rest's elements too.
  return takeAll(undefined, order);
}
export function spreadMutators(order: Order): number {
  const spreadMap: Map<string, unknown> = new Map();
  const pair: [string, Order] = ['x', order];
  spreadMap.set(...pair);
  const spreadSet: Set<unknown> = new Set();
  const one: [Order] = [order];
  spreadSet.add(...one);
  return spreadMap.size + spreadSet.size;
}
