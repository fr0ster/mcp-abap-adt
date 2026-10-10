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
  TOOL_DEFINITION as DebugListSessions_Tool,
  handleDebugListSessions,
} from '../../../handlers/debugger/debug/handleDebugListSessions';
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
import type { HandlerEntry } from '../interfaces.js';

/**
 * The debugger tools — opt-in (`--exposition=…,debug`): a breakpoint catches
 * every request of the connected SAP user. Their state lives in the server
 * instance (`HandlerContext.debugger`).
 */
export class DebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugHandlers';

  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: DebugStartListener_Tool,
        handler: (args: any) => handleDebugStartListener(this.context, args),
      },
      {
        toolDefinition: DebugTakeOverListener_Tool,
        handler: (args: any) => handleDebugTakeOverListener(this.context, args),
      },
      {
        toolDefinition: DebugWait_Tool,
        handler: (args: any) => handleDebugWait(this.context, args),
      },
      {
        toolDefinition: DebugSetBreakpoints_Tool,
        handler: (args: any) => handleDebugSetBreakpoints(this.context, args),
      },
      {
        toolDefinition: DebugDeleteBreakpoint_Tool,
        handler: (args: any) => handleDebugDeleteBreakpoint(this.context, args),
      },
      {
        toolDefinition: DebugListBreakpoints_Tool,
        handler: (args: any) => handleDebugListBreakpoints(this.context, args),
      },
      {
        toolDefinition: DebugGetStack_Tool,
        handler: (args: any) => handleDebugGetStack(this.context, args),
      },
      {
        toolDefinition: DebugSetStackPosition_Tool,
        handler: (args: any) => handleDebugSetStackPosition(this.context, args),
      },
      {
        toolDefinition: DebugGetVariables_Tool,
        handler: (args: any) => handleDebugGetVariables(this.context, args),
      },
      {
        toolDefinition: DebugSetVariable_Tool,
        handler: (args: any) => handleDebugSetVariable(this.context, args),
      },
      {
        toolDefinition: DebugStep_Tool,
        handler: (args: any) => handleDebugStep(this.context, args),
      },
      {
        toolDefinition: DebugStepToLine_Tool,
        handler: (args: any) => handleDebugStepToLine(this.context, args),
      },
      {
        toolDefinition: DebugTerminate_Tool,
        handler: (args: any) => handleDebugTerminate(this.context, args),
      },
      {
        toolDefinition: DebugCreateWatchpoint_Tool,
        handler: (args: any) => handleDebugCreateWatchpoint(this.context, args),
      },
      {
        toolDefinition: DebugListWatchpoints_Tool,
        handler: (args: any) => handleDebugListWatchpoints(this.context, args),
      },
      {
        toolDefinition: DebugDeleteWatchpoint_Tool,
        handler: (args: any) => handleDebugDeleteWatchpoint(this.context, args),
      },
      {
        toolDefinition: DebugGetMemorySizes_Tool,
        handler: (args: any) => handleDebugGetMemorySizes(this.context, args),
      },
      {
        toolDefinition: DebugCreateMemorySnapshot_Tool,
        handler: (args: any) =>
          handleDebugCreateMemorySnapshot(this.context, args),
      },
      {
        toolDefinition: DebugStop_Tool,
        handler: (args: any) => handleDebugStop(this.context, args),
      },
      {
        toolDefinition: DebugListSessions_Tool,
        handler: (args: any) => handleDebugListSessions(this.context, args),
      },
      {
        toolDefinition: AmdpDebugStart_Tool,
        handler: (args: any) => handleAmdpDebugStart(this.context, args),
      },
      {
        toolDefinition: AmdpDebugSetBreakpoints_Tool,
        handler: (args: any) =>
          handleAmdpDebugSetBreakpoints(this.context, args),
      },
      {
        toolDefinition: AmdpDebugWait_Tool,
        handler: (args: any) => handleAmdpDebugWait(this.context, args),
      },
      {
        toolDefinition: AmdpDebugStep_Tool,
        handler: (args: any) => handleAmdpDebugStep(this.context, args),
      },
      {
        toolDefinition: AmdpDebugGetTable_Tool,
        handler: (args: any) => handleAmdpDebugGetTable(this.context, args),
      },
      {
        toolDefinition: AmdpDebugCancel_Tool,
        handler: (args: any) => handleAmdpDebugCancel(this.context, args),
      },
      {
        toolDefinition: AmdpDebugStop_Tool,
        handler: (args: any) => handleAmdpDebugStop(this.context, args),
      },
      {
        toolDefinition: MemorySnapshotList_Tool,
        handler: (args: any) => handleMemorySnapshotList(this.context, args),
      },
      {
        toolDefinition: MemorySnapshotGet_Tool,
        handler: (args: any) => handleMemorySnapshotGet(this.context, args),
      },
      {
        toolDefinition: MemorySnapshotDelta_Tool,
        handler: (args: any) => handleMemorySnapshotDelta(this.context, args),
      },
    ];
  }
}
