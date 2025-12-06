# Creating and Updating ABAP Service Definitions (High-Level)

## Create Service Definition

**Tool**: `CreateServiceDefinition`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","description":"Test service definition","package_name":"ZOK_LAB","transport_request":"E19K905635","source_code":"@EndUserText.label: 'Test Service Definition'\ndefine service ZSD_TEST_001 {\n  expose ZCDS_TEST_001 as TestView;\n}","activate":true}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","uri":"/sap/bc/adt/core/srvb/srvbdefinitions/zsd_test_001","message":"Service definition ZSD_TEST_001 created and activated successfully"}
```

---

## Update Service Definition

**Tool**: `UpdateServiceDefinition`

**Request**:
```json
{"service_definition_name":"ZSD_TEST_001","source_code":"@EndUserText.label: 'Test Service Definition Updated'\ndefine service ZSD_TEST_001 {\n  expose ZCDS_TEST_001 as TestView;\n  expose ZCDS_TEST_002 as TestView2;\n}","activate":true}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_TEST_001","uri":"/sap/bc/adt/core/srvb/srvbdefinitions/zsd_test_001","message":"Service definition ZSD_TEST_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

