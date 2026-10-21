const onRejected = (reason: Error): string | undefined => reason.stack;

export const run = (p: Promise<string>) => p.then(undefined, onRejected);
