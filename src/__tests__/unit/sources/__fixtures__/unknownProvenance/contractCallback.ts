// Callbacks typed by a generic contract nobody in the repository calls: one
// that takes the contract's instantiation, `unknown` where the instantiation
// put it, passes; one that writes `unknown` where the contract has a type is
// refused with that type.
export interface Order {
  readonly id: string;
}

export interface Reading<T> {
  readonly value: T;
  readonly raw: string;
}

export function asInstantiated(read: Promise<Reading<unknown>>): Promise<string> {
  return read.then((carried: Reading<unknown>) => String(carried.value));
}

export function widened(read: Promise<Reading<Order>>): Promise<string> {
  return read.then((widenedReading: Reading<unknown>) =>
    String(widenedReading.value),
  );
}
