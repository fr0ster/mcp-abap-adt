import type {
  IAdtError,
  IAdtHeaders,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';

// A third party's type is its contract, but its type arguments are ours
// where we write them: each `unknown` we supply is refused where written.
export type Answer = IAdtResponse<unknown, IAdtError>;

export interface Reads {
  read(): Promise<IAdtResponse<unknown[], IAdtError>>;
}

export function textOf(
  answer: IAdtResponse<Record<string, unknown>, IAdtError>,
) {
  return answer.ok ? 'read' : 'refused';
}

// Nested in a container of the language's own: still written here.
export const pending: Array<Promise<IAdtResponse<unknown, IAdtError>>> = [];

// Typed arguments pass; a third party's own type holds what it holds.
export type Typed = IAdtResponse<string, IAdtError>;
export const headers: IAdtHeaders | undefined = undefined;
