export const answer = (payload: object): string =>
  JSON.stringify(payload, undefined, '\t');
