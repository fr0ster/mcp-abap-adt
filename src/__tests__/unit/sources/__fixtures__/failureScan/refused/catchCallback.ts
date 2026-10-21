export const run = (p: Promise<void>) =>
  p.catch((reason: Error) => reason.message);
