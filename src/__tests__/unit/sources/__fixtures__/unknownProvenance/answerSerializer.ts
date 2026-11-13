// A named sink: an implementation of `IAnswerSerializer`, the contract that
// turns a value of any type into a tool answer, takes any value.
export interface IAnswerSerializer<A> {
  json(payload: unknown, isError?: boolean): A;
}

interface Answer {
  isError: boolean;
  text: string;
}

const answers: IAnswerSerializer<Answer> = {
  json(payload: unknown, isError = false): Answer {
    return { isError, text: JSON.stringify(payload, null, 2) };
  },
};

export function run(): Answer[] {
  return [answers.json({ id: 'A' }), answers.json(42, true)];
}
