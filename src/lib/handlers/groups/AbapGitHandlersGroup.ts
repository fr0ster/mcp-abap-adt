/**
 * The abapGit tools of the full sets (spec §4.1): every one in
 * `fullToolSet`, the reads alone in `fullReadOnlyToolSet`. Registration is
 * by system kind (`available_in`, `variants`); whether they are listed and
 * served at all is the system's discovery (`abapGit/availability.ts`), and
 * every call goes through the server's admission first
 * (`abapGit/admission.ts`).
 */
import {
  TOOL_DEFINITION as GetAbapGitBranchInfo_Tool,
  handleGetAbapGitBranchInfo,
} from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import {
  handleLinkAbapGitRepo,
  TOOL_DEFINITION as LinkAbapGitRepo_Tool,
} from '../../../handlers/abapgit/high/handleLinkAbapGitRepo';
import {
  handlePullAbapGitRepo,
  TOOL_DEFINITION as PullAbapGitRepo_Tool,
} from '../../../handlers/abapgit/high/handlePullAbapGitRepo';
import {
  handlePushAbapGitRepo,
  TOOL_DEFINITION as PushAbapGitRepo_Tool,
} from '../../../handlers/abapgit/high/handlePushAbapGitRepo';
import {
  handleSwitchAbapGitBranch,
  TOOL_DEFINITION as SwitchAbapGitBranch_Tool,
} from '../../../handlers/abapgit/high/handleSwitchAbapGitBranch';
import {
  handleUnlinkAbapGitRepo,
  TOOL_DEFINITION as UnlinkAbapGitRepo_Tool,
} from '../../../handlers/abapgit/high/handleUnlinkAbapGitRepo';
import {
  TOOL_DEFINITION as CheckAbapGitExternalRepo_Tool,
  handleCheckAbapGitExternalRepo,
} from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import {
  TOOL_DEFINITION as CheckAbapGitRepo_Tool,
  handleCheckAbapGitRepo,
} from '../../../handlers/abapgit/readonly/handleCheckAbapGitRepo';
import {
  TOOL_DEFINITION as GetAbapGitErrorLog_Tool,
  handleGetAbapGitErrorLog,
} from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import {
  TOOL_DEFINITION as GetAbapGitFile_Tool,
  handleGetAbapGitFile,
} from '../../../handlers/abapgit/readonly/handleGetAbapGitFile';
import {
  TOOL_DEFINITION as GetAbapGitModifiedObjects_Tool,
  handleGetAbapGitModifiedObjects,
} from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import {
  TOOL_DEFINITION as GetAbapGitStaging_Tool,
  handleGetAbapGitStaging,
} from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import {
  handleListAbapGitRepos,
  TOOL_DEFINITION as ListAbapGitRepos_Tool,
} from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import { defineKindTool } from '../../abapGit/kindTool';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/** The reads: in the read-only sets too (spec §4.1, "-ro"). */
export function abapGitReadEntries(): HandlerEntry[] {
  return [
    defineTool(ListAbapGitRepos_Tool, handleListAbapGitRepos),
    defineTool(CheckAbapGitExternalRepo_Tool, handleCheckAbapGitExternalRepo),
    defineTool(GetAbapGitModifiedObjects_Tool, handleGetAbapGitModifiedObjects),
    defineTool(GetAbapGitStaging_Tool, handleGetAbapGitStaging),
    defineTool(CheckAbapGitRepo_Tool, handleCheckAbapGitRepo),
    defineTool(GetAbapGitFile_Tool, handleGetAbapGitFile),
    defineTool(GetAbapGitErrorLog_Tool, handleGetAbapGitErrorLog),
  ];
}

/** The writes: what changes the system or the remote repository. */
export function abapGitWriteEntries(): HandlerEntry[] {
  return [
    defineTool(GetAbapGitBranchInfo_Tool, handleGetAbapGitBranchInfo),
    defineKindTool(LinkAbapGitRepo_Tool, handleLinkAbapGitRepo),
    defineTool(UnlinkAbapGitRepo_Tool, handleUnlinkAbapGitRepo),
    defineKindTool(PullAbapGitRepo_Tool, handlePullAbapGitRepo),
    defineKindTool(PushAbapGitRepo_Tool, handlePushAbapGitRepo),
    defineTool(SwitchAbapGitBranch_Tool, handleSwitchAbapGitBranch),
  ];
}

export class AbapGitHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'AbapGitHandlers';

  /** `reads`: the reads alone, for the read-only sets. */
  constructor(
    context: HandlerContext,
    private readonly scope: 'all' | 'reads' = 'all',
  ) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return this.scope === 'reads'
      ? abapGitReadEntries()
      : [...abapGitReadEntries(), ...abapGitWriteEntries()];
  }
}
