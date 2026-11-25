# MCP Prompts - MCP ABAP ADT Server

Generated from the prompts every binary lists (`tests/fixtures/tools/listed-prompts.json`, by `npm run docs:tools`), not from docs.

## What a prompt is

A prompt is a ready-made request the MCP client offers the user. Claude Code, in [its own words](https://code.claude.com/docs/en/mcp.md#use-mcp-prompts-as-commands), "lists each MCP prompt as `/servername:promptname (MCP)`. Typing `/mcp__servername__promptname` also runs it." For a server named `abap`, `get` is listed as `/abap:get (MCP)`, and `/mcp__abap__get class ZCL_DEMO` runs it. Other clients show prompts in their own pickers. The server answers with an instruction that names the tools to call, in order, with the arguments filled from the values the user gave. The model follows the instruction with the tools the same binary serves.

Nine prompts: `create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`, `transport`. The object prompts take `object_type` and `name` (a function module also takes `function_group`, except in `unit_test`, whose run names the module alone and covers the ABAP Unit tests of its whole function group); `object_type`, `transport`'s `action` and `where_used`'s `container` complete in lower case and are accepted in any case. Each binary lists the prompts its tools serve, and the `object_type` values its tools serve on the system kind.

## Autocompletion

A client that supports MCP completion (`completion/complete`) completes a prompt's closed arguments with exactly what this binary serves, matching what the user typed without regard to case:

- `object_type` (every object prompt, `unit_test`, `where_used`): the values this binary's tools serve on the system kind, after `--deny-actions`, in lower case.
- `transport` `action`: the actions this binary serves.
- `transport` `object_type`: the transport object types, when the action given takes one (or no action is given yet).
- `where_used` `container`: the values the where-used tool lists.
- `unit_test` `include_subpackages`: `true`, `false`.

The lists per binary and kind below are these completions.

## Refusal

A `prompts/get` with an `object_type` the binary does not serve (unknown, not served on the system kind, or denied) is refused with the protocol's invalid-params error and no instruction: `<prompt>: object_type "<value>" is not served by this server; it serves <list>.` A required argument that is absent or blank is refused the same way: `<prompt>: <argument> is required.` So is a `function_group` given for an `object_type` whose steps read none: `<prompt>: function_group is read with object_type function_module only.`.

A prompt whose tools are denied (`--deny-actions`, [ACCESS_RESTRICTIONS.md](ACCESS_RESTRICTIONS.md)) loses those `object_type` values; a prompt with none left is not listed.

`prompts: false` on `BaseMcpServer` or `EmbeddableMcpServer` lists none; `registerAbapPrompts(server, registry)` adds them to a plain registration ([HANDLER_EXPORTER.md](../architecture/HANDLER_EXPORTER.md)).

## On-premise system (`onprem`)

### `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `unit_test`, `cds_unit_test`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `function_module`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `create_task`, `list`, `get`, `objects`, `log`, `add_object`, `remove_object`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`, `log`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `get`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`

## Cloud system (`cloud`)

### `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `unit_test`, `cds_unit_test`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `function_module`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `create_task`, `list`, `get`, `objects`, `log`, `add_object`, `remove_object`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`, `log`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `get`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`

## No system kind stated (stdio inspection mode, an embedder that states none)

### `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `unit_test`, `cds_unit_test`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `function_module`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `create_task`, `list`, `get`, `objects`, `log`, `add_object`, `remove_object`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`, `log`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `get`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `get`, `objects`

## Legacy system (`legacy`)

### `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`, `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`, `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`, `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

No prompt is listed.

