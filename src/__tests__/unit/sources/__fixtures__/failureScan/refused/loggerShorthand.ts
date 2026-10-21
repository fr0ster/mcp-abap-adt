interface Logger {
  error(...args: unknown[]): void;
}

export function run(work: () => void, logger: Logger): void {
  try {
    work();
  } catch (caught) {
    logger.error('failed', { caught });
  }
}
