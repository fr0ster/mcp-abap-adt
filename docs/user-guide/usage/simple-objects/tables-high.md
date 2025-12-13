# Creating and Updating ABAP Tables (High-Level)

## Create Table

**Tool**: `CreateTable`

**Request**:
```json
{"table_name":"ZT_TEST_001","ddl_code":"@EndUserText.label : 'Test Table'\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_test_001 {\n  key client : abap.clnt not null;\n  key id : abap.char(10) not null;\n  name : abap.char(255);\n  description : abap.char(500);\n  created_at : abap.dats;\n  created_by : abap.char(12);\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":true}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","uri":"/sap/bc/adt/ddic/tables/zt_test_001","message":"Table ZT_TEST_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Table

**Tool**: `UpdateTable`

**Request**:
```json
{"table_name":"ZT_TEST_001","ddl_code":"@EndUserText.label : 'Test Table Updated'\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_test_001 {\n  key client : abap.clnt not null;\n  key id : abap.char(10) not null;\n  name : abap.char(255);\n  description : abap.char(500);\n  created_at : abap.dats;\n  created_by : abap.char(12);\n  updated_at : abap.dats;\n  updated_by : abap.char(12);\n}","activate":true}
```

**Response**:
```json
{"success":true,"table_name":"ZT_TEST_001","uri":"/sap/bc/adt/ddic/tables/zt_test_001","message":"Table ZT_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

