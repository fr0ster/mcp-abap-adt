/**
 * The abapGit tools, full and compact (spec §4.1, §4.2): always listed, the
 * names whose calls depend on the system serving abapGit (`availability.ts`,
 * decided at call time). Registration stays by system kind; this list says
 * only which names are abapGit's.
 */

/** The full set's abapGit tools. */
export const ABAPGIT_FULL_TOOLS = [
  'ListAbapGitRepos',
  'CheckAbapGitExternalRepo',
  'GetAbapGitBranchInfo',
  'LinkAbapGitRepo',
  'UnlinkAbapGitRepo',
  'PullAbapGitRepo',
  'GetAbapGitModifiedObjects',
  'GetAbapGitStaging',
  'PushAbapGitRepo',
  'CheckAbapGitRepo',
  'GetAbapGitFile',
  'SwitchAbapGitBranch',
  'GetAbapGitErrorLog',
] as const;

/** The compact set's abapGit tools. */
export const ABAPGIT_COMPACT_TOOLS = [
  'HandlerAbapGitGet',
  'HandlerAbapGit',
] as const;

const ABAPGIT_TOOLS: ReadonlySet<string> = new Set<string>([
  ...ABAPGIT_FULL_TOOLS,
  ...ABAPGIT_COMPACT_TOOLS,
]);

/** Whether `tool` is an abapGit tool, full or compact. */
export function isAbapGitTool(tool: string): boolean {
  return ABAPGIT_TOOLS.has(tool);
}
