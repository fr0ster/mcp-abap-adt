import { AdtSAPError } from '@mcp-abap-adt/adt-clients';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';

/**
 * The two steps an ATC run needs before it can start, and which channel their
 * failures arrive on.
 *
 * **`AdtAtc` is a runtime client, not a core object.** Its members answer
 * `IAdtResponse` and take no `analyse` and no result set — the whole runtime
 * family is built that way, and the default reading `answering()` applies is
 * already the one this repository would inject: a throw or a non-2xx is a
 * failure, a document never is. So nothing here supplies a strategy, and the
 * shaping of what comes back is this layer's own work, as it is for every
 * `RuntimeX` tool.
 *
 * What does need handling is that two of the five members answer differently
 * from the other three. `resolveCheckVariant()` and `createWorklist()` call
 * the connection directly rather than through `answering()`, so they return a
 * bare string and **throw** — on a 403 from SAP exactly as on a malformed
 * answer. Two channels are useful: a throw usually means the fault is on this
 * side. But a refusal from the server arriving on the throw channel would be
 * reported as `client_threw`, blaming this process for something SAP decided.
 *
 * `AdtSAPError` is exported, so the distinction is recoverable here without
 * asking the client to make it: a thrown `AdtSAPError` becomes a refusal
 * carrying SAP's own message, and anything else stays a throw, which is what
 * it is.
 */
export async function answering<T>(
  step: () => Promise<T>,
): Promise<IAdtResponse<T, IAdtError>> {
  try {
    return succeeded(await step());
  } catch (thrown) {
    if (thrown instanceof AdtSAPError) {
      return refused({
        origin: 'refusal',
        message: thrown.message,
        adtType: (thrown as { adtType?: string }).adtType,
        namespace: (thrown as { namespace?: string }).namespace,
      });
    }
    throw thrown;
  }
}

const succeeded = <T>(value: T): IAdtResponse<T, IAdtError> =>
  ({
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('atcRun: asked for the error of a success');
    },
  }) as unknown as IAdtResponse<T, IAdtError>;

const refused = <T>(error: IAdtError): IAdtResponse<T, IAdtError> =>
  ({
    ok: false,
    getResult: () => {
      throw new Error('atcRun: asked for the result of a failure');
    },
    getError: () => error,
  }) as unknown as IAdtResponse<T, IAdtError>;
