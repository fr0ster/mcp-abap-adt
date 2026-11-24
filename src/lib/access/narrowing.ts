/**
 * The compact tools a deny list narrows value by value (spec §3.1): the
 * eleven whose `object_type` / `target_type` is projected per variant, the
 * eight with a fixed `action` / `operation` (`HandlerSystem` among them), and
 * `HandlerGetData` (`sql`).
 * Each states its values per variant, its ADT codes where a code argument
 * takes them (HandlerActivate, HandlerGet), and its definition for the
 * values and codes left — built by the same builders the tool's own
 * definition is, so with nothing removed it is the tool's definition.
 */

import {
  ACTIVATION_CODES,
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_DELETION_CHECK,
  COMPACT_LOCK,
  COMPACT_PROFILE,
  COMPACT_READ,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  type ProjectionVariant,
  TABLE_CODES,
} from '../adtProjections';
import {
  ABAPGIT_GET_ON,
  ABAPGIT_WRITE_ON,
  handlerAbapGitDefinitionFor,
  handlerAbapGitGetDefinitionFor,
} from '../compact/abapGit/definitions';
import {
  BATCH_ACTIONS,
  handlerBatchDefinition,
} from '../compact/batch/handleHandlerBatch';
import {
  compactActivateDescription,
  compactCheckRunDescription,
  compactCreateDescription,
  compactDeleteDescription,
  compactDeletionCheckDescription,
  compactGetDescription,
  compactLockDescription,
  compactProfileRunDescription,
  compactUpdateDescription,
  compactValidateDescription,
} from '../compact/compactDescriptions';
import {
  COMPACT_MAIN_PROGRAMS,
  compactActivateSchemaFor,
  compactCheckRunSchemaFor,
  compactCreateSchemaFor,
  compactDeleteSchemaFor,
  compactDeletionCheckSchemaFor,
  compactGetSchemaFor,
  compactLockSchemaFor,
  compactProfileRunSchemaFor,
  compactUpdateSchemaFor,
  compactValidateSchemaFor,
  handlerGetDataDefinition,
  handlerSystemDefinitionFor,
  SYSTEM_ACTIONS,
} from '../compact/compactSchemas';
import {
  DEBUG_BATCH_ACTIONS,
  handlerDebugBatchDefinition,
} from '../compact/debug/handleHandlerDebugBatch';
import {
  BREAKPOINT_OPERATIONS,
  handlerDebugBreakpointsDefinition,
} from '../compact/debug/handleHandlerDebugBreakpoints';
import {
  handlerDebugMaintainDefinition,
  MAINTAIN_OPERATIONS,
} from '../compact/debug/handleHandlerDebugMaintain';
import {
  handlerDebugSessionDefinition,
  SESSION_OPERATIONS,
} from '../compact/debug/handleHandlerDebugSession';
import {
  handlerDebugStepDefinition,
  STEP_OPERATIONS,
} from '../compact/debug/handleHandlerDebugStep';
import {
  handlerSessionDefinition,
  SESSION_ACTIONS,
} from '../compact/longSession/handleHandlerSession';
import { HANDLER_GET_DRAFT_TYPES } from '../draft/draftTypes';
import type { VariantToolDefinition } from '../handlers/interfaces';

/** How a deny list narrows one compact tool. */
export interface Narrowing {
  readonly tool: string;
  /** The values of its dispatching argument (or its modes) on `variant`. */
  values(variant: ProjectionVariant): readonly string[];
  /** The ADT codes its code arguments take on `variant`, where it has any. */
  codes?(variant: ProjectionVariant): readonly string[];
  /**
   * Its definition on `variant` with `values` left, and `codes` left when a
   * code was removed (`undefined`: the code arguments as they are).
   */
  definition(
    variant: ProjectionVariant,
    values: readonly string[],
    codes: readonly string[] | undefined,
  ): VariantToolDefinition;
}

/** Of `full`, those `kept` names, typed as `full` is. */
function keptOf<T extends string>(
  full: readonly T[],
  kept: readonly string[],
): T[] {
  return full.filter((value) => kept.includes(value));
}

/** A narrowing whose values do not depend on the variant. */
function fixed(
  tool: string,
  all: readonly string[],
  build: (values: readonly string[]) => {
    readonly description: string;
    readonly inputSchema: VariantToolDefinition['inputSchema'];
  },
): Narrowing {
  return {
    tool,
    values: () => all,
    definition: (_variant, values) => build(values),
  };
}

const NARROWING_LIST: readonly Narrowing[] = [
  {
    tool: 'HandlerActivate',
    values: (variant) => COMPACT_ACTIVATE[variant],
    codes: (variant) => ACTIVATION_CODES[variant],
    definition(variant, values, codes) {
      const members = keptOf(COMPACT_ACTIVATE[variant], values);
      return {
        description: compactActivateDescription(variant, members),
        inputSchema: compactActivateSchemaFor(members, variant, codes),
        members,
      };
    },
  },
  {
    tool: 'HandlerCheckRun',
    values: (variant) => COMPACT_CHECK[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_CHECK[variant], values);
      return {
        description: compactCheckRunDescription(variant, members),
        inputSchema: compactCheckRunSchemaFor(members, COMPACT_CHECK[variant]),
        members,
      };
    },
  },
  {
    tool: 'HandlerCreate',
    values: (variant) => COMPACT_CREATE[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_CREATE[variant], values);
      return {
        description: compactCreateDescription(variant, members),
        inputSchema: compactCreateSchemaFor(members, COMPACT_CREATE[variant]),
        members,
      };
    },
  },
  {
    tool: 'HandlerDelete',
    values: (variant) => COMPACT_DELETE[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_DELETE[variant], values);
      return {
        description: compactDeleteDescription(variant, members),
        inputSchema: compactDeleteSchemaFor(members, COMPACT_DELETE[variant]),
        members,
      };
    },
  },
  {
    tool: 'HandlerDeletionCheck',
    values: (variant) => COMPACT_DELETION_CHECK[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_DELETION_CHECK[variant], values);
      return {
        description: compactDeletionCheckDescription(variant, members),
        inputSchema: compactDeletionCheckSchemaFor(members),
        members,
      };
    },
  },
  {
    tool: 'HandlerGet',
    values: (variant) => COMPACT_READ[variant],
    codes: (variant) => TABLE_CODES[variant],
    definition(variant, values, codes) {
      const members = keptOf(COMPACT_READ[variant], values);
      return {
        description: compactGetDescription(variant, members),
        inputSchema: compactGetSchemaFor(
          members,
          keptOf(COMPACT_MAIN_PROGRAMS[variant], values),
          codes,
          COMPACT_READ[variant],
          keptOf(HANDLER_GET_DRAFT_TYPES[variant], values),
        ),
        members,
      };
    },
  },
  {
    tool: 'HandlerLock',
    values: (variant) => COMPACT_LOCK[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_LOCK[variant], values);
      return {
        description: compactLockDescription(variant, members),
        inputSchema: compactLockSchemaFor(members),
        members,
      };
    },
  },
  {
    tool: 'HandlerUpdate',
    values: (variant) => COMPACT_UPDATE[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_UPDATE[variant], values);
      return {
        description: compactUpdateDescription(variant, members),
        inputSchema: compactUpdateSchemaFor(members, COMPACT_UPDATE[variant]),
        members,
      };
    },
  },
  {
    tool: 'HandlerValidate',
    values: (variant) => COMPACT_VALIDATE[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_VALIDATE[variant], values);
      return {
        description: compactValidateDescription(variant, members),
        inputSchema: compactValidateSchemaFor(
          members,
          COMPACT_VALIDATE[variant],
        ),
        members,
      };
    },
  },
  {
    tool: 'HandlerProfileRun',
    values: (variant) => COMPACT_PROFILE[variant],
    definition(variant, values) {
      const members = keptOf(COMPACT_PROFILE[variant], values);
      return {
        description: compactProfileRunDescription(variant, members),
        inputSchema: compactProfileRunSchemaFor(members),
        members,
      };
    },
  },
  fixed('HandlerBatch', BATCH_ACTIONS, (values) =>
    handlerBatchDefinition(keptOf(BATCH_ACTIONS, values)),
  ),
  fixed('HandlerDebugBatch', DEBUG_BATCH_ACTIONS, (values) =>
    handlerDebugBatchDefinition(keptOf(DEBUG_BATCH_ACTIONS, values)),
  ),
  fixed('HandlerSession', SESSION_ACTIONS, (values) =>
    handlerSessionDefinition(keptOf(SESSION_ACTIONS, values)),
  ),
  fixed('HandlerDebugSession', SESSION_OPERATIONS, (values) =>
    handlerDebugSessionDefinition(keptOf(SESSION_OPERATIONS, values)),
  ),
  fixed('HandlerDebugStep', STEP_OPERATIONS, (values) =>
    handlerDebugStepDefinition(keptOf(STEP_OPERATIONS, values)),
  ),
  fixed('HandlerDebugBreakpoints', BREAKPOINT_OPERATIONS, (values) =>
    handlerDebugBreakpointsDefinition(keptOf(BREAKPOINT_OPERATIONS, values)),
  ),
  fixed('HandlerDebugMaintain', MAINTAIN_OPERATIONS, (values) =>
    handlerDebugMaintainDefinition(keptOf(MAINTAIN_OPERATIONS, values)),
  ),
  // HandlerSystem's actions are the same on both variants; its words of
  // where_used's object_type are the variant's, so its definition takes it.
  {
    tool: 'HandlerSystem',
    values: () => SYSTEM_ACTIONS,
    definition: (variant, values) =>
      handlerSystemDefinitionFor(variant, keptOf(SYSTEM_ACTIONS, values)),
  },
  // The abapGit actions differ by kind: each variant's enum holds what that
  // system serves.
  {
    tool: 'HandlerAbapGitGet',
    values: (variant) => ABAPGIT_GET_ON[variant],
    definition: (variant, values) =>
      handlerAbapGitGetDefinitionFor(keptOf(ABAPGIT_GET_ON[variant], values)),
  },
  {
    tool: 'HandlerAbapGit',
    values: (variant) => ABAPGIT_WRITE_ON[variant],
    definition: (variant, values) =>
      handlerAbapGitDefinitionFor(
        variant,
        keptOf(ABAPGIT_WRITE_ON[variant], values),
      ),
  },
  fixed('HandlerGetData', ['sql'], (values) =>
    handlerGetDataDefinition(values.includes('sql')),
  ),
];

/** The narrowings, by tool name. */
export const NARROWINGS: ReadonlyMap<string, Narrowing> = new Map(
  NARROWING_LIST.map((narrowing) => [narrowing.tool, narrowing]),
);
