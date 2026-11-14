// A position deep inside a finite type is read however deep it lies.
interface Box<T> {
  readonly value: T;
}

export function deep(): number {
  const boxed: Box<Box<Box<Box<Box<Box<Box<unknown>>>>>>> = {
    value: { value: { value: { value: { value: { value: { value: 42 } } } } } },
  };
  return boxed === undefined ? 0 : 1;
}
