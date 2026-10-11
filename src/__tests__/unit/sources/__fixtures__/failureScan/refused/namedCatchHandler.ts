function onFailure(reason: Error): string {
  return reason.message;
}

export const run = (p: Promise<string>) => p.catch(onFailure);
