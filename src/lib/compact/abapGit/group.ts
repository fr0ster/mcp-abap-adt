/**
 * The compact abapGit tools (spec §4.2): `HandlerAbapGitGet` in the compact
 * and compact read-only sets, `HandlerAbapGit` in the compact set alone.
 * Listed where the system's discovery serves abapGit; every call goes
 * through the server's admission first.
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../../handlers/index';
import {
  TOOL_DEFINITION as HandlerAbapGit_Tool,
  handleHandlerAbapGit,
} from './handleHandlerAbapGit';
import {
  TOOL_DEFINITION as HandlerAbapGitGet_Tool,
  handleHandlerAbapGitGet,
} from './handleHandlerAbapGitGet';

export function compactAbapGitEntries(scope: 'all' | 'reads'): HandlerEntry[] {
  return [
    defineTool(HandlerAbapGitGet_Tool, handleHandlerAbapGitGet),
    ...(scope === 'all'
      ? [defineTool(HandlerAbapGit_Tool, handleHandlerAbapGit)]
      : []),
  ];
}

export class CompactAbapGitHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactAbapGitHandlers';

  /** `reads`: `HandlerAbapGitGet` alone, for the compact read-only set. */
  constructor(
    context: HandlerContext,
    private readonly scope: 'all' | 'reads' = 'all',
  ) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactAbapGitEntries(this.scope);
  }
}
