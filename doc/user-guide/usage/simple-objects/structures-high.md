# Creating and Updating ABAP Structures (High-Level)

## Create Structure

**Tool**: `CreateStructure`

**Request**:
```json
{"structure_name":"ZS_TEST_001","description":"Test structure","package_name":"ZOK_LAB","transport_request":"E19K905635","ddl_code":"@EndUserText.label: 'Test Structure'\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine structure zs_test_001 {\n  client : abap.clnt;\n  id : abap.char(10);\n  name : abap.char(255);\n}","activate":true}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","uri":"/sap/bc/adt/ddic/structures/zs_test_001","message":"Structure ZS_TEST_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Structure

**Tool**: `UpdateStructure`

**Request**:
```json
{"structure_name":"ZS_TEST_001","ddl_code":"@EndUserText.label: 'Test Structure Updated'\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine structure zs_test_001 {\n  client : abap.clnt;\n  id : abap.char(10);\n  name : abap.char(255);\n  description : abap.char(500);\n}","activate":true}
```

**Response**:
```json
{"success":true,"structure_name":"ZS_TEST_001","uri":"/sap/bc/adt/ddic/structures/zs_test_001","message":"Structure ZS_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

