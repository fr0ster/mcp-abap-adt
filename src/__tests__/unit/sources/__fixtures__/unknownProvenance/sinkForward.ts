// A sink that hands its value on: what it receives is of any type by its
// contract, and so is what it passes to a function of its own.
export interface ILogger {
  info(message: string, meta?: unknown): void;
}

function line(meta: unknown): string {
  return typeof meta === 'string' ? meta : JSON.stringify(meta);
}

export const logger: ILogger = {
  info(message: string, meta?: unknown): void {
    process.stderr.write(`${message} ${line(meta)}\n`);
  },
};

export function run(): void {
  logger.info('order', { id: 'A' });
  logger.info('count', 42);
}
