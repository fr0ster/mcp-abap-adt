# Goal: MCP prompts for the common ABAP work

## Goal

Every server binary offers MCP prompts — slash commands a client shows its user — that
turn the common ABAP work into a formal call instead of free text: `/create class ZCL_X
"…"`, `/get program ZPROG`, `/activate …`. A user picks a prompt, fills its arguments,
and the model receives an instruction that names the exact tool and arguments of that
binary, so the request is carried out the same way every time.

## Invariants

- **Operation first.** One prompt per operation (create, get, update, delete, activate,
  and the other operations the binary's tools serve); the object type and the rest are the
  prompt's arguments. The object type's argument completes from the types the binary
  serves.
- **One user-facing syntax across binaries.** The same prompt name and arguments in every
  binary that serves the operation; what differs is only the instruction the prompt
  produces.
- **Generated from the binary's own tools.** A prompt's instruction is built from the tool
  definitions the binary registers (the full set names `CreateClass`; compact names
  `HandlerCreate` with `object_type`), never from a hand-written copy that can drift.
- **Shown only when it can work.** A prompt is listed only when its tool is registered and
  not denied (the deny list, the read-only binaries, the system kind); an object type a
  binary does not serve is neither completed nor accepted.
- **Explainable.** Each prompt's name, arguments and description say what it does, what it
  takes and what the model will be asked to call — functional words only.
- **Static types first; no new runtime dependency.** The prompts are typed by the tool
  definitions they come from; the MCP SDK the server already uses carries them.

## Out of scope

- Completing object names from the SAP system (a request to SAP per completion) — its own
  decision later.
- Prompts for work no registered tool serves.
- Changing any tool's behaviour, schema or description.
