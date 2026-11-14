// A sink written as an object literal's member: the literal is typed by the
// named contract, so its member is the contract's.
interface ILogger {
  info(message: string, meta?: unknown): void;
}

const lines: string[] = [];

const logger: ILogger = {
  info: (message: string, meta?: unknown) => {
    lines.push(`${message} ${String(meta)}`);
  },
};

export function log(count: number): void {
  logger.info('counted', { count });
}
