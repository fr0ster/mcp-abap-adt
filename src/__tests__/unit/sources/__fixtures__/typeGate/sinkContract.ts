// The type gate: a sink contract's own `unknown` (`SINK_CONTRACTS`, here a
// logger's meta) is not warned — its declaration, and a class implementing it.
export interface ILogger {
  info(message: string, meta?: unknown): void;
}

export class Quiet implements ILogger {
  info(message: string, meta?: unknown): void {
    void message;
    void meta;
  }
}

// Warned: the same `unknown` outside the contract.
export function loose(meta: unknown): string {
  return String(meta);
}
