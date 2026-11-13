// A value laundered through an `unknown`: `read` receives only `unknown`
// values, but each of them was an `Order` one step before.
export interface Order {
  readonly id: string;
}

function read(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function forward(value: unknown): string {
  return read(value);
}

export function run(order: Order): string {
  return forward(order);
}
