import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { AtcObjectType } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourAtc } from '../../../lib/strategies/resultSets';
import { succeededWith } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

/**
 * An ATC run is three calls, and the client says so.
 *
 * `AdtAtc` deliberately stopped being `IAdtRunnable` in 19.0.0: *"That atom's
 * `run` is one call, and an ATC run is three: the check variant, a worklist
 * for it, then the run itself. A member that made all three chose the order
 * and denied the caller a worklist they could reuse. The atom stays in the
 * contract for whoever composes them."* Composing them is this handler's job,
 * which is where composites belong.
 *
 * **The worklist is the durable half.** A run is not a choice between
 * synchronous and asynchronous: `wait` only decides whether the server holds
 * the request until the checks are done. Either way the findings are written
 * into the worklist the caller created here, and stay readable by
 * `GetATCFindings` long afterwards. So `worklist_id` is in every answer;
 * `run_id` only when there is one to poll, and `finding_stats` only when the
 * server waited and counted.
 */
export const TOOL_DEFINITION = {
  name: 'RunATC',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Run ABAP Test Cockpit checks over one or more objects. Creates a worklist for the check variant, then starts the run. Answers worklist_id always — findings stay readable with GetATCFindings whether or not the run waited. With wait=false it also answers run_id, for GetATCRunStatus; with wait=true the server holds the request until the checks finish and answers the finding counts.',
  inputSchema: {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        description:
          'The objects to check. One run may cover several; each needs a name and a type.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Object name, e.g. "ZCL_MY_CLASS".',
            },
            type: {
              type: 'string',
              enum: [
                'class',
                'interface',
                'function_group',
                'package',
                'ddl_source',
                'table',
                'behavior_definition',
              ],
              description:
                'Object type. "package" checks everything inside the package.',
            },
          },
          required: ['name', 'type'],
        },
        minItems: 1,
      },
      check_variant: {
        type: 'string',
        description:
          "ATC check variant. Omitted, the system's own default variant is used.",
      },
      max_findings: {
        type: 'integer',
        minimum: 1,
        description:
          'Cap on findings the run records (maximumVerdicts). A whole number, at least 1. Default 100.',
        default: 100,
      },
      wait: {
        type: 'boolean',
        description:
          'Hold the request until the checks finish and answer the finding counts. Default false: the run starts and answers a run_id to poll.',
        default: false,
      },
    },
    required: ['objects'],
  },
} as const;

interface RunATCArgs {
  objects?: Array<{ name?: string; type?: AtcObjectType }>;
  check_variant?: string;
  max_findings?: number;
  wait?: boolean;
}

/**
 * **No `detail`.** The parameter shapes a document's answer, and there is no
 * document here: these fields are composed from three calls, and terse, full
 * and raw would be the same four keys.
 */

export async function handleRunATC(context: HandlerContext, args: RunATCArgs) {
  const { connection, logger } = context;
  const objects = args?.objects ?? [];

  if (objects.length === 0) {
    return return_error(
      new Error('objects is required: an ATC run needs at least one object.'),
    );
  }
  const incomplete = objects.find((o) => !o?.name || !o?.type);
  if (incomplete) {
    return return_error(
      new Error(
        `Every object needs a name and a type; got ${JSON.stringify(incomplete)}.`,
      ),
    );
  }

  const [first, ...rest] = objects.map((o) => ({
    objectName: (o.name as string).toUpperCase(),
    objectType: o.type as AtcObjectType,
  }));
  const target = { objects: [first, ...rest] as const };

  // **Said in the schema and checked here, for the same reason the client
  // gives for checking it at all:** *"The server answers 0 with a 400, and a
  // client that can name the problem should not spend a round trip being
  // told."* `AdtAtc.assertMaximumVerdicts` does throw on 0, on a negative and
  // on a fraction — but a throw is rendered `client_threw`, which reads as a
  // fault of this process rather than an argument the caller can fix. A tool
  // that can name it in its own schema should not leave it to an exception.
  const maximumVerdicts = args.max_findings ?? 100;
  if (!Number.isInteger(maximumVerdicts) || maximumVerdicts < 1) {
    return return_error(
      new Error(
        `max_findings must be a whole number of at least 1; got ${JSON.stringify(args.max_findings)}.`,
      ),
    );
  }

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);
  const wait = args.wait === true;

  return answer(
    { tool: 'RunATC', detail: 'terse' },
    async () => {
      // **Not a `sequence`.** Its steps see only what the one before produced,
      // and the answer owes the caller the worklist id from step two together
      // with the run from step three. Written out, each step's own failure is
      // still the answer, untouched, which is the rule `sequence` exists to
      // keep.
      // adt-clients 23: both answer `IAdtResponse` rather than a bare string
      // (MIGRATION-23 §9), so SAP's refusal is the answer as it came.
      const given = args.check_variant?.trim();
      let checkVariant: string;
      if (given) {
        checkVariant = given;
      } else {
        const variant = await atc.resolveCheckVariant({
          analyse: analyseException,
        });
        if (!variant.ok) return variant as never;
        checkVariant = variant.getResult().value;
      }

      const worklist = await atc.createWorklist(checkVariant, {
        analyse: analyseException,
      });
      if (!worklist.ok) return worklist as never;
      const worklistId = worklist.getResult().value;

      const run = await atc.startRun(worklistId, target, {
        analyse: analyseException,
        wait,
        maximumVerdicts,
      });
      if (!run.ok) return run as never;

      return succeededWith({
        checkVariant,
        worklistId,
        run: run.getResult().value,
      });
    },
    ({ checkVariant, worklistId, run }) => ({
      success: true,
      check_variant: checkVariant,
      // Always: the findings live here, and `GetATCFindings` reads them by
      // this id whether the run waited or not.
      worklist_id: worklistId,
      waited: run.waited,
      ...(run.waited
        ? // `FINDING_STATS` verbatim — a comma-separated triple the client
          // deliberately does not name, since only two of its three positions
          // have ever been seen non-zero.
          { finding_stats: run.findingStats }
        : { run_id: run.runId }),
      objects: target.objects.map((o) => ({
        name: o.objectName,
        type: o.objectType,
      })),
    }),
  );
}
