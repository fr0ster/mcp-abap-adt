# Test fixtures

## `polygon.backup.yaml`

A clean snapshot of the integration-test shared polygon (package `ZMCP_SHR_PKG`),
produced by the external [`@mcp-abap-adt/adt-backup`](https://www.npmjs.com/package/@mcp-abap-adt/adt-backup)
CLI (installed globally, **not** a dependency of this repo). schemaVersion 2.

Captured objects include the shared tables/views/CDS/classes plus the
function-group children (`ZMCP_SHR_FGRP` → `Z_MCP_SHR_FM`, `LZMCP_SHR_FGRPTOP`)
and the embedded structures (`ZMCP_SHR_STRU` / `ZMCP_SHR_STRU_INC`). The generated
`L<FUGR>UXX` collector is filtered out by the backup tool. **No secrets**
(connection/auth details are never written to a backup — only object source/metadata).

### Regenerate
```bash
npm run polygon:backup        # adt-backup ≥ 1.5.0 installed globally; trial.env at repo root
```

### Restore the polygon from this fixture (manual, external CLI)
```bash
adt-backup plan    --input tests/fixtures/polygon.backup.yaml --output /tmp/plan.yaml
adt-backup verify  --plan  /tmp/plan.yaml --env-path trial.env
adt-backup restore --plan  /tmp/plan.yaml --env-path trial.env
```
(Restore of function-group includes requires adt-backup ≥ 1.5.0.)
