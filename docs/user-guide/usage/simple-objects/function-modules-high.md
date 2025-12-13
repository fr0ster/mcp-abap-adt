# Creating and Updating ABAP Function Modules (High-Level)

## Create Function Module

**Tool**: `CreateFunctionModule`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","function_module_name":"Z_TEST_FM_001","source_code":"FUNCTION z_test_fm_001.\n*\"----------------------------------------------------------------------\n*\"*\"Local Interface:\n*\"  IMPORTING\n*\"     VALUE(IV_INPUT) TYPE STRING\n*\"  EXPORTING\n*\"     VALUE(EV_OUTPUT) TYPE STRING\n*\"----------------------------------------------------------------------\n  ev_output = iv_input.\nENDFUNCTION.","description":"Test function module","transport_request":"E19K905635","activate":true}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001/functions/z_test_fm_001","message":"Function module Z_TEST_FM_001 created and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

---

## Update Function Module

**Tool**: `UpdateFunctionModule`

**Request**:
```json
{"function_group_name":"ZTEST_FG_001","function_module_name":"Z_TEST_FM_001","source_code":"FUNCTION z_test_fm_001.\n*\"----------------------------------------------------------------------\n*\"*\"Local Interface:\n*\"  IMPORTING\n*\"     VALUE(IV_INPUT) TYPE STRING\n*\"  EXPORTING\n*\"     VALUE(EV_OUTPUT) TYPE STRING\n*\"  CHANGING\n*\"     VALUE(CV_VALUE) TYPE STRING\n*\"----------------------------------------------------------------------\n  ev_output = iv_input.\n  cv_value = 'Updated'.\nENDFUNCTION.","activate":true}
```

**Response**:
```json
{"success":true,"function_module_name":"Z_TEST_FM_001","function_group_name":"ZTEST_FG_001","uri":"/sap/bc/adt/functions/groups/ztest_fg_001/functions/z_test_fm_001","message":"Function module Z_TEST_FM_001 updated and activated successfully","activation":{"activated":true,"checked":true,"generated":false},"hasActivationWarnings":false}
```

