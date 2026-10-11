import {
  TOOL_DEFINITION as AmdpDebugCancel_Tool,
  handleAmdpDebugCancel,
} from '../../../handlers/debugger/debug/handleAmdpDebugCancel';
import {
  TOOL_DEFINITION as AmdpDebugGetTable_Tool,
  handleAmdpDebugGetTable,
} from '../../../handlers/debugger/debug/handleAmdpDebugGetTable';
import {
  TOOL_DEFINITION as AmdpDebugSetBreakpoints_Tool,
  handleAmdpDebugSetBreakpoints,
} from '../../../handlers/debugger/debug/handleAmdpDebugSetBreakpoints';
import {
  TOOL_DEFINITION as AmdpDebugStart_Tool,
  handleAmdpDebugStart,
} from '../../../handlers/debugger/debug/handleAmdpDebugStart';
import {
  TOOL_DEFINITION as AmdpDebugStep_Tool,
  handleAmdpDebugStep,
} from '../../../handlers/debugger/debug/handleAmdpDebugStep';
import {
  TOOL_DEFINITION as AmdpDebugStop_Tool,
  handleAmdpDebugStop,
} from '../../../handlers/debugger/debug/handleAmdpDebugStop';
import {
  TOOL_DEFINITION as AmdpDebugWait_Tool,
  handleAmdpDebugWait,
} from '../../../handlers/debugger/debug/handleAmdpDebugWait';
import {
  TOOL_DEFINITION as DebugCreateMemorySnapshot_Tool,
  handleDebugCreateMemorySnapshot,
} from '../../../handlers/debugger/debug/handleDebugCreateMemorySnapshot';
import {
  TOOL_DEFINITION as DebugCreateWatchpoint_Tool,
  handleDebugCreateWatchpoint,
} from '../../../handlers/debugger/debug/handleDebugCreateWatchpoint';
import {
  TOOL_DEFINITION as DebugDeleteBreakpoint_Tool,
  handleDebugDeleteBreakpoint,
} from '../../../handlers/debugger/debug/handleDebugDeleteBreakpoint';
import {
  TOOL_DEFINITION as DebugDeleteWatchpoint_Tool,
  handleDebugDeleteWatchpoint,
} from '../../../handlers/debugger/debug/handleDebugDeleteWatchpoint';
import {
  TOOL_DEFINITION as DebugGetMemorySizes_Tool,
  handleDebugGetMemorySizes,
} from '../../../handlers/debugger/debug/handleDebugGetMemorySizes';
import {
  TOOL_DEFINITION as DebugGetStack_Tool,
  handleDebugGetStack,
} from '../../../handlers/debugger/debug/handleDebugGetStack';
import {
  TOOL_DEFINITION as DebugGetVariables_Tool,
  handleDebugGetVariables,
} from '../../../handlers/debugger/debug/handleDebugGetVariables';
import {
  TOOL_DEFINITION as DebugListBreakpoints_Tool,
  handleDebugListBreakpoints,
} from '../../../handlers/debugger/debug/handleDebugListBreakpoints';
import {
  TOOL_DEFINITION as DebugListWatchpoints_Tool,
  handleDebugListWatchpoints,
} from '../../../handlers/debugger/debug/handleDebugListWatchpoints';
import {
  TOOL_DEFINITION as DebugSetBreakpoints_Tool,
  handleDebugSetBreakpoints,
} from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import {
  TOOL_DEFINITION as DebugSetStackPosition_Tool,
  handleDebugSetStackPosition,
} from '../../../handlers/debugger/debug/handleDebugSetStackPosition';
import {
  TOOL_DEFINITION as DebugSetVariable_Tool,
  handleDebugSetVariable,
} from '../../../handlers/debugger/debug/handleDebugSetVariable';
import {
  TOOL_DEFINITION as DebugStartListener_Tool,
  handleDebugStartListener,
} from '../../../handlers/debugger/debug/handleDebugStartListener';
import {
  TOOL_DEFINITION as DebugStep_Tool,
  handleDebugStep,
} from '../../../handlers/debugger/debug/handleDebugStep';
import {
  TOOL_DEFINITION as DebugStepToLine_Tool,
  handleDebugStepToLine,
} from '../../../handlers/debugger/debug/handleDebugStepToLine';
import {
  TOOL_DEFINITION as DebugStop_Tool,
  handleDebugStop,
} from '../../../handlers/debugger/debug/handleDebugStop';
import {
  TOOL_DEFINITION as DebugTakeOverListener_Tool,
  handleDebugTakeOverListener,
} from '../../../handlers/debugger/debug/handleDebugTakeOverListener';
import {
  TOOL_DEFINITION as DebugTerminate_Tool,
  handleDebugTerminate,
} from '../../../handlers/debugger/debug/handleDebugTerminate';
import {
  TOOL_DEFINITION as DebugWait_Tool,
  handleDebugWait,
} from '../../../handlers/debugger/debug/handleDebugWait';
import {
  handleMemorySnapshotDelta,
  TOOL_DEFINITION as MemorySnapshotDelta_Tool,
} from '../../../handlers/debugger/debug/handleMemorySnapshotDelta';
import {
  handleMemorySnapshotGet,
  TOOL_DEFINITION as MemorySnapshotGet_Tool,
} from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import {
  handleMemorySnapshotList,
  TOOL_DEFINITION as MemorySnapshotList_Tool,
} from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import { defineTool, type HandlerEntry } from '../interfaces.js';

/**
 * The debugger tools — opt-in (`--exposition=…,debug`): a breakpoint catches
 * every request of the connected SAP user. Their state lives in the server
 * instance (`HandlerContext.debugger`).
 */
export class DebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugHandlers';

  getHandlers(): HandlerEntry[] {
    return [
      defineTool(DebugStartListener_Tool, handleDebugStartListener),
      defineTool(DebugTakeOverListener_Tool, handleDebugTakeOverListener),
      defineTool(DebugWait_Tool, handleDebugWait),
      defineTool(DebugSetBreakpoints_Tool, handleDebugSetBreakpoints),
      defineTool(DebugDeleteBreakpoint_Tool, handleDebugDeleteBreakpoint),
      defineTool(DebugListBreakpoints_Tool, handleDebugListBreakpoints),
      defineTool(DebugGetStack_Tool, handleDebugGetStack),
      defineTool(DebugSetStackPosition_Tool, handleDebugSetStackPosition),
      defineTool(DebugGetVariables_Tool, handleDebugGetVariables),
      defineTool(DebugSetVariable_Tool, handleDebugSetVariable),
      defineTool(DebugStep_Tool, handleDebugStep),
      defineTool(DebugStepToLine_Tool, handleDebugStepToLine),
      defineTool(DebugTerminate_Tool, handleDebugTerminate),
      defineTool(DebugCreateWatchpoint_Tool, handleDebugCreateWatchpoint),
      defineTool(DebugListWatchpoints_Tool, handleDebugListWatchpoints),
      defineTool(DebugDeleteWatchpoint_Tool, handleDebugDeleteWatchpoint),
      defineTool(DebugGetMemorySizes_Tool, handleDebugGetMemorySizes),
      defineTool(
        DebugCreateMemorySnapshot_Tool,
        handleDebugCreateMemorySnapshot,
      ),
      defineTool(DebugStop_Tool, handleDebugStop),
      defineTool(AmdpDebugStart_Tool, handleAmdpDebugStart),
      defineTool(AmdpDebugSetBreakpoints_Tool, handleAmdpDebugSetBreakpoints),
      defineTool(AmdpDebugWait_Tool, handleAmdpDebugWait),
      defineTool(AmdpDebugStep_Tool, handleAmdpDebugStep),
      defineTool(AmdpDebugGetTable_Tool, handleAmdpDebugGetTable),
      defineTool(AmdpDebugCancel_Tool, handleAmdpDebugCancel),
      defineTool(AmdpDebugStop_Tool, handleAmdpDebugStop),
      defineTool(MemorySnapshotList_Tool, handleMemorySnapshotList),
      defineTool(MemorySnapshotGet_Tool, handleMemorySnapshotGet),
      defineTool(MemorySnapshotDelta_Tool, handleMemorySnapshotDelta),
    ];
  }
}
