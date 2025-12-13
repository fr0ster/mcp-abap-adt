# Creating and Updating ABAP Data Elements (High-Level)

## Create Data Element (Domain-based)

**Tool**: `CreateDataElement`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","description":"Test data element","package_name":"ZOK_LAB","transport_request":"E19K905635","type_kind":"domain","type_name":"ZDOMAIN_TEST_001","short_label":"Test DE","medium_label":"Test Data Element","long_label":"Test Data Element Label","heading_label":"Test Data Element Heading","activate":true}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_001","message":"Data element ZDTEL_TEST_001 created and activated successfully"}
```

---

## Create Data Element (Predefined Type)

**Tool**: `CreateDataElement`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_002","description":"Test data element with predefined type","package_name":"ZOK_LAB","transport_request":"E19K905635","type_kind":"predefinedAbapType","data_type":"CHAR","length":10,"decimals":0,"short_label":"Test DE2","medium_label":"Test Data Element 2","long_label":"Test Data Element Label 2","activate":true}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_002","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_002","message":"Data element ZDTEL_TEST_002 created and activated successfully"}
```

---

## Update Data Element

**Tool**: `UpdateDataElement`

**Request**:
```json
{"data_element_name":"ZDTEL_TEST_001","description":"Updated test data element","short_label":"Updated DE","medium_label":"Updated Data Element","long_label":"Updated Data Element Label","activate":true}
```

**Response**:
```json
{"success":true,"data_element_name":"ZDTEL_TEST_001","uri":"/sap/bc/adt/ddic/dataelements/zdtel_test_001","message":"Data element ZDTEL_TEST_001 updated and activated successfully"}
```

