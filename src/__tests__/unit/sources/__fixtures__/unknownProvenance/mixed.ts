// A mixed site: an `Order` from the repository and parsed text both reach `label`.
export interface Order {
  readonly id: string;
}

function label(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function fromOrder(order: Order): string {
  return label(order);
}

export function fromText(text: string): string {
  return label(JSON.parse(text));
}
