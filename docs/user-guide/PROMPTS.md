# MCP Prompts - MCP ABAP ADT Server

Generated from the prompts every binary lists (`tests/fixtures/tools/listed-prompts.json`, by `npm run docs:tools`), not from docs.

## What a prompt is

A prompt is a ready-made request the MCP client offers the user: a slash command in Claude Code (`/mcp__<server>__create class ZCL_DEMO package_name=ZPKG`), an entry in the prompt picker of other clients. The server answers with an instruction that names the tools to call, in order, with the arguments filled from the values the user gave. The model follows the instruction with the tools the same binary serves.

Nine prompts: `create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`, `transport`. The object prompts take `object_type` and `name` (a function module also takes `function_group`); `object_type` completes in lower case and is accepted in any case. Each binary lists the prompts its tools serve, and the `object_type` values its tools serve on the system kind.

## Refusal

A `prompts/get` with an `object_type` the binary does not serve (unknown, not served on the system kind, or denied) is refused with the protocol's invalid-params error and no instruction: `<prompt>: object_type "<value>" is not served by this server; it serves <list>.` A required argument that is absent or blank is refused the same way: `<prompt>: <argument> is required.`

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
- `transport` - `action`: `list`, `get`, `objects`, `log`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `objects`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

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
- `transport` - `action`: `list`, `get`, `objects`, `log`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `objects`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

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
- `transport` - `action`: `list`, `get`, `objects`, `log`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`

- `create` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `update` - `object_type`: `package`, `domain`, `data_element`, `table_type`, `function_group`, `table`, `structure`, `ddl`, `service_definition`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`, `cds_unit_test`, `program`, `include`, `interface`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `service_binding`
- `delete` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `cds_unit_test`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `unit_test`
- `activate` - `object_type`: `class`, `program`, `include`, `interface`, `function_group`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `package`, `service_definition`, `service_binding`, `function_module`, `behavior_implementation`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `unit_test` - `object_type`: `class`, `program`, `function_group`, `function_module`, `ddl`, `package`; `include_subpackages`: `true`, `false`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `create`, `list`, `objects`, `move_objects`, `sort_compress`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

### `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

- `get` - `object_type`: `package`, `domain`, `data_element`, `table`, `structure`, `table_type`, `ddl`, `service_definition`, `service_binding`, `class`, `local_test_class`, `local_types`, `local_definitions`, `local_macros`, `program`, `include`, `interface`, `function_group`, `function_module`, `behavior_definition`, `behavior_implementation`, `metadata_extension`
- `check` - `object_type`: `class`, `program`, `interface`, `function_group`, `function_module`, `table`, `structure`, `table_type`, `ddl`, `domain`, `data_element`, `package`, `behavior_definition`, `metadata_extension`
- `where_used` - `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `function_module`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`, `text_elements`; `container`: `program`, `function_group`
- `transport` - `action`: `list`, `objects`; `object_type`: `class`, `interface`, `program`, `include`, `function_group`, `package`, `ddl`, `table`, `structure`, `table_type`, `domain`, `data_element`, `behavior_definition`, `metadata_extension`, `service_definition`, `service_binding`

## Legacy system (`legacy`)

### `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`, `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`, `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`, `mcp-abap-adt-compact-ro`, `mcp-abap-adt-compact-http-ro`, `mcp-abap-adt-compact-sse-ro`

No prompt is listed.

