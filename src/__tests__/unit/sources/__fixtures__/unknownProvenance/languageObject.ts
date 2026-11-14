// A runtime object the language declares with no type parameter (`Error`):
// what its contract types `unknown` (`cause`) is the language's, like a third
// party's, and no position of the repository's — whatever generic carries it.
export interface Order {
  readonly id: string;
}

function carrying<E extends Error>(error: E, order: Order): E {
  return Object.assign(error, { id: order.id });
}

export function failedOrder(order: Order): Error {
  return carrying(new Error('the order failed'), order);
}

class OrderError extends Error {}

export function subclassed(order: Order): OrderError {
  return carrying(new OrderError('the order failed'), order);
}
