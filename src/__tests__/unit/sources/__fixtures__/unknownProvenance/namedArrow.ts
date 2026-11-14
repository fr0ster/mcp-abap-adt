// Round 8: a callback written as a named arrow and handed on by name is
// judged by the contract it is handed to, as an inline one is; so is a named
// function stored in a typed list or written as a shorthand member, whose
// list's and object's function types write the `unknown` themselves.
const read = (namedArrow: unknown): boolean => typeof namedArrow === 'number';

export function later(): Promise<boolean> {
  return Promise.resolve(42).then(read);
}

function check(listed: unknown): boolean {
  return listed !== null;
}

export const checks: Array<(checked: unknown) => boolean> = [check];

function inspect(member: unknown): boolean {
  return member !== null;
}

export const inspector: { inspect: (inspected: unknown) => boolean } = {
  inspect,
};

export function run(): boolean {
  return checks.every((each) => each(42)) && inspector.inspect('x');
}
