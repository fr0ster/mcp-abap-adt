// A named sink: a member of `ILogger`, a contract the sinks name, takes any value.
export interface ILogger {
  info(message: string, meta?: unknown): void;
}

export class Logger implements ILogger {
  readonly lines: string[] = [];

  info(message: string, meta?: unknown): void {
    this.lines.push(`${message} ${String(meta)}`);
  }
}

export function run(logger: ILogger): void {
  logger.info('order', { id: 'A' });
  logger.info('count', 42);
}
