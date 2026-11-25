/**
 * The denied actions applied once, at registration (spec §3.1): a denied
 * tool is not in its group's entries; a tool with a denied value or code is
 * narrowed — its definition rebuilt from what is left (`NARROWINGS`), its
 * call parsing the arguments with that definition before the original call
 * runs; a compact tool every value of which is denied is left out. Nothing
 * denied, nothing changes: the same groups and entries.
 */
import type { ProjectionVariant } from '../adtProjections.js';
import { systemKindOf } from '../connectionFactory.js';
import { withRulesOf } from '../handlers/argumentRules.js';
import { BaseHandlerGroup } from '../handlers/base/BaseHandlerGroup.js';
import {
  type HandlerEntry,
  type IHandlerGroup,
  invalidArgumentsWords,
  type SapEnvironment,
  schemaOn,
  type ToolDefinition,
  type VariantToolDefinition,
} from '../handlers/interfaces.js';
import {
  type DeniedActions,
  type DeniedEntry,
  namesText,
  UNLOCK_TOOL,
} from './deniedActions.js';
import { NarrowedHandlerGroup } from './NarrowedHandlerGroup.js';
import { NARROWINGS, type Narrowing } from './narrowing.js';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/**
 * `denied` with each entry that names the 23.x unlock tool (`HandlerUnlock`,
 * `HandlerUn*`) read as HandlerLock's action unlock too: denying the old
 * tool closes the action it became, never leaving it open.
 */
function withUnlockAction(denied: DeniedActions): DeniedActions {
  const unlocks = denied
    .filter(
      (entry) =>
        entry.value === undefined &&
        namesText(entry.tool, entry.toolIsPrefix, UNLOCK_TOOL),
    )
    .map(
      (entry): DeniedEntry => ({
        text: entry.text,
        tool: 'HandlerLock',
        toolIsPrefix: false,
        value: 'unlock',
        valueIsPrefix: false,
      }),
    );
  return unlocks.length === 0 ? denied : [...denied, ...unlocks];
}

/** Whether a `Tool` / `Prefix*` entry names the tool `name`. */
function deniesTool(entry: DeniedEntry, name: string): boolean {
  return (
    entry.value === undefined && namesText(entry.tool, entry.toolIsPrefix, name)
  );
}

/** The value entries for the tool `name`. */
function valueEntries(
  denied: DeniedActions,
  name: string,
): readonly DeniedEntry[] {
  return denied.filter(
    (entry) => entry.value !== undefined && entry.tool === name,
  );
}

/** Of `values`, those no value entry names. */
function leftOf(
  values: readonly string[],
  entries: readonly DeniedEntry[],
): string[] {
  return values.filter(
    (value) =>
      !entries.some(
        (entry) =>
          entry.value !== undefined &&
          namesText(entry.value, entry.valueIsPrefix, value),
      ),
  );
}

/** What is left of a narrowable tool on one variant. */
interface LeftOn {
  readonly values: readonly string[];
  /** The codes left, `undefined` when none was denied. */
  readonly codes: readonly string[] | undefined;
  /** The actions left, where the tool's actions are narrowed (HandlerLock). */
  readonly actions: readonly string[] | undefined;
  /** Whether nothing callable is left on the variant. */
  readonly empty: boolean;
}

function leftOn(
  narrowing: Narrowing,
  variant: ProjectionVariant,
  entries: readonly DeniedEntry[],
): LeftOn {
  const all = narrowing.values(variant);
  const values = leftOf(all, entries);
  const actions =
    narrowing.actions === undefined
      ? undefined
      : leftOf(narrowing.actions, entries);
  const allCodes = narrowing.codes?.(variant);
  const codes = allCodes === undefined ? undefined : leftOf(allCodes, entries);
  const codesDenied =
    allCodes !== undefined &&
    codes !== undefined &&
    codes.length < allCodes.length;
  // HandlerGet and HandlerGetData keep forms no value names (the address and
  // run parts; the table read): only a `Tool` entry removes them.
  const keepsUnnamed =
    narrowing.tool === 'HandlerGet' || narrowing.tool === 'HandlerGetData';
  const empty =
    (actions !== undefined && actions.length === 0) ||
    (!keepsUnnamed &&
      values.length === 0 &&
      (codes === undefined || codes.length === 0));
  return {
    values,
    codes: codesDenied ? codes : undefined,
    actions,
    empty,
  };
}

/** `environments` without those whose variant has nothing left. */
function availableOn(
  definition: ToolDefinition,
  emptyOn: ReadonlySet<ProjectionVariant>,
): readonly SapEnvironment[] | undefined {
  if (emptyOn.size === 0) return definition.available_in;
  const stated: readonly SapEnvironment[] = definition.available_in ?? [
    'onprem',
    'cloud',
    'legacy',
  ];
  return stated.filter((environment) =>
    environment === 'cloud' ? !emptyOn.has('cloud') : !emptyOn.has('onprem'),
  );
}

/** `entry` narrowed by its value entries, or left out (`undefined`). */
function narrowed(
  entry: HandlerEntry,
  narrowing: Narrowing,
  entries: readonly DeniedEntry[],
): HandlerEntry | undefined {
  const onprem = leftOn(narrowing, 'onprem', entries);
  const cloud = leftOn(narrowing, 'cloud', entries);
  if (onprem.empty && cloud.empty) return undefined;
  // The narrowed listing keeps the tool's own rules on that variant (its
  // routes' checks, `HandlerGet`'s), where its builder states none.
  const stated = (variant: ProjectionVariant, left: LeftOn) => {
    const narrowed = narrowing.definition(
      variant,
      left.values,
      left.codes,
      left.actions,
    );
    return {
      ...narrowed,
      inputSchema: withRulesOf(
        schemaOn(entry.toolDefinition, variant),
        narrowed.inputSchema,
      ),
    };
  };
  const variants: { readonly [V in ProjectionVariant]: VariantToolDefinition } =
    { onprem: stated('onprem', onprem), cloud: stated('cloud', cloud) };
  const emptyOn = new Set(
    VARIANTS.filter((variant) =>
      variant === 'onprem' ? onprem.empty : cloud.empty,
    ),
  );
  const available = availableOn(entry.toolDefinition, emptyOn);
  const own = variants.onprem;
  const toolDefinition: ToolDefinition = {
    ...entry.toolDefinition,
    description: own.description,
    inputSchema: own.inputSchema,
    ...(own.members !== undefined ? { members: own.members } : {}),
    ...(available !== undefined ? { available_in: available } : {}),
    ...(entry.toolDefinition.variants !== undefined ? { variants } : {}),
  };
  const original = entry.call;
  return {
    ...entry,
    toolDefinition,
    // The narrowed schema is the one check of the call's arguments: a
    // property it dropped (`sql_query`) never reaches the original call.
    call: async (context, args) => {
      // The narrowed schema of the connection's variant: the rules of its
      // type lists too.
      const parsed = schemaOn(
        toolDefinition,
        toolDefinition.variants === undefined
          ? undefined
          : systemKindOf(context.connection),
      ).safeParse(args);
      if (!parsed.success) {
        throw new Error(
          invalidArgumentsWords(entry.toolDefinition.name, parsed.error.issues),
        );
      }
      return original(context, parsed.data);
    },
  };
}

/** One group's entries with the deny list applied; `undefined`: unchanged. */
function narrowedEntries(
  entries: readonly HandlerEntry[],
  deniedActions: DeniedActions,
): HandlerEntry[] | undefined {
  const denied = withUnlockAction(deniedActions);
  let changed = false;
  const out: HandlerEntry[] = [];
  for (const entry of entries) {
    const name = entry.toolDefinition.name;
    if (denied.some((each) => deniesTool(each, name))) {
      changed = true;
      continue;
    }
    const narrowing = NARROWINGS.get(name);
    const values = valueEntries(denied, name);
    if (narrowing === undefined || values.length === 0) {
      out.push(entry);
      continue;
    }
    const kept = narrowed(entry, narrowing, values);
    changed = true;
    if (kept !== undefined) out.push(kept);
  }
  return changed ? out : undefined;
}

/** The deny list applied to `groups`, each group keeping its class. */
export function withoutDenied(
  groups: readonly BaseHandlerGroup[],
  denied: DeniedActions,
): BaseHandlerGroup[];
export function withoutDenied(
  groups: readonly IHandlerGroup[],
  denied: DeniedActions,
): IHandlerGroup[];
export function withoutDenied(
  groups: readonly IHandlerGroup[],
  denied: DeniedActions,
): IHandlerGroup[] {
  if (denied.length === 0) return [...groups];
  return groups.map((group) => {
    // A group that is not a BaseHandlerGroup is an embedder's own: its
    // tools are its own.
    if (!(group instanceof BaseHandlerGroup)) return group;
    const entries = narrowedEntries(group.getHandlers(), denied);
    return entries === undefined
      ? group
      : new NarrowedHandlerGroup(group, entries);
  });
}

/** Whether `entry` names anything of `entries` (tools by name) on either variant. */
function matches(entry: DeniedEntry, tools: readonly HandlerEntry[]): boolean {
  if (entry.value === undefined) {
    return tools.some((tool) => deniesTool(entry, tool.toolDefinition.name));
  }
  const narrowing = NARROWINGS.get(entry.tool);
  if (
    narrowing === undefined ||
    !tools.some((tool) => tool.toolDefinition.name === entry.tool)
  ) {
    return false;
  }
  const actions = narrowing.actions ?? [];
  if (leftOf(actions, [entry]).length < actions.length) return true;
  return VARIANTS.some(
    (variant) =>
      leftOf(narrowing.values(variant), [entry]).length <
        narrowing.values(variant).length ||
      leftOf(narrowing.codes?.(variant) ?? [], [entry]).length <
        (narrowing.codes?.(variant) ?? []).length,
  );
}

/** The entries of `denied` that name no tool, value or code of `groups`. */
export function unmatchedEntries(
  groups: readonly IHandlerGroup[],
  denied: DeniedActions,
): readonly string[] {
  const tools = groups.flatMap((group) => group.getHandlers());
  // An entry naming the 23.x unlock tool matches through the action it
  // became.
  const unlocks = withUnlockAction(denied).slice(denied.length);
  return denied
    .filter(
      (entry) =>
        !matches(entry, tools) &&
        !unlocks.some(
          (unlock) => unlock.text === entry.text && matches(unlock, tools),
        ),
    )
    .map((entry) => entry.text);
}
