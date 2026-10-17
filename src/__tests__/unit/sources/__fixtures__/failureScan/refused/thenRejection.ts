export const run = (p: Promise<void>) =>
  p.then(undefined, (reason: Error) => reason.stack);
