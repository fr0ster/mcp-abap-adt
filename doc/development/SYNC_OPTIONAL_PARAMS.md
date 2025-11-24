# Sync Optional Parameters from adt-clients

## Overview

This tool synchronizes parameter optionality between TypeScript interfaces in `@mcp-abap-adt/adt-clients` and handler TOOL_DEFINITION in `mcp-abap-adt`.

## Problem

Handler TOOL_DEFINITION should match the TypeScript interfaces from adt-clients builders. When a parameter is optional in the TypeScript interface (`field?: type`), it should be marked as `(optional)` in the handler's description and not included in the `required` array.

## Solution

The `sync-optional-from-interfaces.js` script:

1. Reads TypeScript interfaces from adt-clients (e.g., `DomainBuilderConfig`)
2. Extracts which fields are optional (`?:`) vs required
3. Displays the comparison for review
4. Can optionally update handlers to match

## Usage

### Check current state (dry-run)

```bash
node tools/sync-optional-from-interfaces.js
```

### Update handlers automatically

```bash
node tools/sync-optional-from-interfaces.js --apply
```

## Example Output

```
🔍 Analyzing TypeScript interfaces from adt-clients...

✅ handleCreateDomain.ts:
   Interface: DomainBuilderConfig
   Required fields: domainName
   Optional fields: packageName, transportRequest, description, datatype, length, ...
```

## Adding New Handlers

Edit the `HANDLER_TO_INTERFACE` mapping in the script:

```javascript
const HANDLER_TO_INTERFACE = {
  'handleCreateYourThing.ts': {
    path: 'core/yourThing/YourThingBuilder.ts',
    interface: 'YourThingBuilderConfig',
  },
};
```

## Benefits

- **Single source of truth**: adt-clients TypeScript interfaces
- **Automatic sync**: No manual tracking of optional vs required
- **Type safety**: Matches actual TypeScript type definitions
- **Consistency**: All Create* handlers follow the same pattern

## Related Files

- `/tools/sync-optional-from-interfaces.js` - The sync script
- `/src/handlers/*/handleCreate*.ts` - Handlers that use this (organized in subdirectories: `class/`, `domain/`, `table/`, etc.)
- `@mcp-abap-adt/adt-clients` - Source of truth for interfaces
