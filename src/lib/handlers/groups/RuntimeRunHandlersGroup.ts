import {
  handleRuntimeCreateProfilerTraceParameters,
  TOOL_DEFINITION as RuntimeCreateProfilerTraceParameters_Tool,
} from '../../../handlers/system/high/handleRuntimeCreateProfilerTraceParameters';
import {
  handleRuntimeRunClass,
  TOOL_DEFINITION as RuntimeRunClass_Tool,
} from '../../../handlers/system/high/handleRuntimeRunClass';
import {
  handleRuntimeRunProgram,
  TOOL_DEFINITION as RuntimeRunProgram_Tool,
} from '../../../handlers/system/high/handleRuntimeRunProgram';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerContext, HandlerEntry } from '../interfaces.js';

/**
 * The runtime tools that change the system: the runs of a class and of a
 * program (the code they run can change data) and the profiler trace
 * parameters they schedule. Served by the full binaries, beside the
 * background-run tools; no read-only binary serves them, since a read-only
 * set guarantees that nothing in the system changes (the owner's decision).
 */
export class RuntimeRunHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'RuntimeRunHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: RuntimeCreateProfilerTraceParameters_Tool,
        handler: (args: any) =>
          handleRuntimeCreateProfilerTraceParameters(this.context, args),
      },
      {
        toolDefinition: RuntimeRunClass_Tool,
        handler: (args: any) => handleRuntimeRunClass(this.context, args),
      },
      {
        toolDefinition: RuntimeRunProgram_Tool,
        handler: (args: any) => handleRuntimeRunProgram(this.context, args),
      },
    ];
  }
}
