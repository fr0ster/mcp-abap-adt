interface Logger {
  warn(...args: unknown[]): void;
}

export function run(work: () => void, logger: Logger): void {
  try {
    work();
  } catch (caught) {
    logger.warn('failed', caught);
  }
}
