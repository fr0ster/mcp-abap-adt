/**
 * Which tool handlers have returned or thrown, observed by the test itself:
 * `watch(group)` wraps each entry's handler of a group so its start and its
 * end (a return or a throw alike) are written down. A recorded handler
 * released by an instance's end ends one way or the other; one left pending
 * never does.
 */
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';

export class HandlerLedger {
  private readonly begun: string[] = [];
  private readonly finished: string[] = [];

  /** The group, its handlers wrapped to write down their start and end. */
  watch(group: IHandlerGroup): IHandlerGroup {
    return {
      getName: () => group.getName(),
      registerHandlers: (server: never) => group.registerHandlers(server),
      getHandlers: () =>
        group.getHandlers().map(
          (entry): HandlerEntry => ({
            ...entry,
            call: async (context, args) => {
              this.begun.push(entry.toolDefinition.name);
              try {
                return await entry.call(context, args);
              } finally {
                this.finished.push(entry.toolDefinition.name);
              }
            },
          }),
        ),
      // The shipped groups read their context through it (batchStand sets it).
      setContext: (context: unknown) =>
        (group as unknown as { setContext(c: unknown): void }).setContext(
          context,
        ),
    } as IHandlerGroup;
  }

  /** Whether the handler of `tool` has returned or thrown. */
  endedOf(tool: string): boolean {
    return this.finished.includes(tool);
  }

  /** Whether at least one handler started and every one that started has ended. */
  allEnded(): boolean {
    return this.begun.length > 0 && this.finished.length === this.begun.length;
  }
}
