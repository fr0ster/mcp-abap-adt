// A typed site: every value that reaches `describeOrder` is an `Order`.
export interface Order {
  readonly id: string;
}

function describeOrder(order: unknown): string {
  return typeof order === 'object' && order !== null && 'id' in order
    ? String(order.id)
    : '';
}

export function run(order: Order): string {
  return describeOrder(order);
}
