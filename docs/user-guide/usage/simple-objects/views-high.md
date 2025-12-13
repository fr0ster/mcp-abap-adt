# Creating and Updating ABAP CDS Views (High-Level)

## Create View

**Tool**: `CreateView`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","ddl_source":"@AbapCatalog.sqlViewName: 'ZCDS_TEST_001'\n@AbapCatalog.compiler.compareFilter: true\n@AccessControl.authorizationCheck: #CHECK\n@EndUserText.label: 'Test CDS View'\ndefine view ZCDS_TEST_001 as select from zt_test_001 {\n  key client,\n  key id,\n  name,\n  description\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":true}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001","message":"View ZCDS_TEST_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update View

**Tool**: `UpdateView`

**Request**:
```json
{"view_name":"ZCDS_TEST_001","ddl_source":"@AbapCatalog.sqlViewName: 'ZCDS_TEST_001'\n@AbapCatalog.compiler.compareFilter: true\n@AccessControl.authorizationCheck: #CHECK\n@EndUserText.label: 'Test CDS View Updated'\ndefine view ZCDS_TEST_001 as select from zt_test_001 {\n  key client,\n  key id,\n  name,\n  description,\n  created_at,\n  created_by\n}","activate":true}
```

**Response**:
```json
{"success":true,"view_name":"ZCDS_TEST_001","uri":"/sap/bc/adt/ddic/ddl/sources/zcds_test_001","message":"View ZCDS_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

