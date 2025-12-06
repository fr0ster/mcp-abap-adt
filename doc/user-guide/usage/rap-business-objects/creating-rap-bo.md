# Creating RAP Business Objects

Complete workflow for creating RAP BO with all components using MCP functions.

## Workflow Overview

1. Create Domains (activate: false)
2. Create Data Elements (activate: false)
3. Create Root Table (activate: false)
4. Create Draft Table (activate: false)
5. Create CDS Interface View (activate: false)
6. Create CDS Consumption View (activate: false)
7. Create Behavior Definition (activate: false)
8. Create Behavior Implementation (activate: false)
9. Create Metadata Extension (activate: false)
10. Deferred Group Activation
11. Create Service Definition (activate: true)

---

## Step 1: Create Domains

**Tool**: `CreateDomain`

**Request**:
```json
{"domain_name":"ZDOMAIN_CUSTOMER_ID","description":"Customer ID Domain","package_name":"ZOK_LAB","transport_request":"E19K905635","datatype":"CHAR","length":10,"decimals":0,"activate":false}
```

**Request**:
```json
{"domain_name":"ZDOMAIN_CUSTOMER_NAME","description":"Customer Name Domain","package_name":"ZOK_LAB","transport_request":"E19K905635","datatype":"CHAR","length":255,"decimals":0,"activate":false}
```

---

## Step 2: Create Data Elements

**Tool**: `CreateDataElement`

**Request**:
```json
{"data_element_name":"ZDTEL_CUSTOMER_ID","description":"Customer ID","package_name":"ZOK_LAB","transport_request":"E19K905635","type_kind":"domain","type_name":"ZDOMAIN_CUSTOMER_ID","short_label":"Customer ID","medium_label":"Customer ID","long_label":"Customer ID","activate":false}
```

**Request**:
```json
{"data_element_name":"ZDTEL_CUSTOMER_NAME","description":"Customer Name","package_name":"ZOK_LAB","transport_request":"E19K905635","type_kind":"domain","type_name":"ZDOMAIN_CUSTOMER_NAME","short_label":"Customer Name","medium_label":"Customer Name","long_label":"Customer Name","activate":false}
```

---

## Step 3: Create Root Table

**Tool**: `CreateTable`

**Request**:
```json
{"table_name":"ZT_CUSTOMER","ddl_code":"@EndUserText.label : 'Customer Table'\n@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_customer {\n  key client : abap.clnt not null;\n  key customer_id : abap.char(10) not null;\n  customer_name : abap.char(255);\n  email : abap.char(255);\n  include zmd_s_rap_chng_ctrl;\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":false}
```

---

## Step 4: Create Draft Table

**Tool**: `CreateTable`

**Request**:
```json
{"table_name":"ZT_CUSTOMER_D","ddl_code":"@EndUserText.label : 'Draft table for entity ZT_CUSTOMER'\n@AbapCatalog.enhancement.category : #EXTENSIBLE_ANY\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED\ndefine table zt_customer_d {\n  key mandt : mandt not null;\n  key customer_id : abap.char(10) not null;\n  customer_name : abap.char(255);\n  email : abap.char(255);\n  createdat : abp_creation_tstmpl;\n  createdby : abp_creation_user;\n  lastchangedat : abp_lastchange_tstmpl;\n  lastchangedby : abp_lastchange_user;\n  locallastchangedat : abp_locinst_lastchange_tstmpl;\n  \"%admin\" : include sych_bdl_draft_admin_inc;\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":false}
```

---

## Step 5: Create CDS Interface View

**Tool**: `CreateView`

**Request**:
```json
{"view_name":"ZI_CUSTOMER","ddl_source":"@EndUserText.label: 'Customer Interface View'\n@AccessControl.authorizationCheck: #CHECK\n@Metadata.allowExtensions: true\n@Search.searchable: true\ndefine view entity ZI_CUSTOMER\n  as select from zt_customer\n{\n  key customer_id,\n      customer_name,\n      email,\n      created_at,\n      created_by\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":false}
```

---

## Step 6: Create CDS Consumption View

**Tool**: `CreateView`

**Request**:
```json
{"view_name":"ZC_CUSTOMER","ddl_source":"@EndUserText.label: 'Customer Consumption View'\n@AccessControl.authorizationCheck: #CHECK\n@Metadata.allowExtensions: true\n@Search.searchable: true\ndefine view entity ZC_CUSTOMER\n  as projection on ZI_CUSTOMER\n{\n  key customer_id,\n      customer_name,\n      email,\n      created_at,\n      created_by\n}","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":false}
```

---

## Step 7: Create Behavior Definition

**Tool**: `CreateBehaviorDefinition`

**Request**:
```json
{"name":"ZC_CUSTOMER","description":"Customer Behavior Definition","package_name":"ZOK_LAB","transport_request":"E19K905635","root_entity":"ZC_CUSTOMER","implementation_type":"Managed","activate":false}
```

**Note**: Behavior definition source code will be generated automatically with draft enabled.

---

## Step 8: Create Behavior Implementation

**Tool**: `CreateBehaviorImplementation`

**Request**:
```json
{"class_name":"ZBP_CUSTOMER","description":"Customer Behavior Implementation","package_name":"ZOK_LAB","transport_request":"E19K905635","behavior_definition":"ZC_CUSTOMER","activate":false}
```

---

## Step 9: Create Metadata Extension

**Tool**: `CreateMetadataExtension`

**Request**:
```json
{"name":"ZC_CUSTOMER","description":"Customer Metadata Extension","package_name":"ZOK_LAB","transport_request":"E19K905635","activate":false}
```

**Note**: Metadata extension source code needs to be updated separately with UI annotations.

---

## Step 10: Deferred Group Activation

**Tool**: `ActivateObjectLow`

**Request**:
```json
{"objects":[{"name":"ZDOMAIN_CUSTOMER_ID","type":"DOMA/DD"},{"name":"ZDOMAIN_CUSTOMER_NAME","type":"DOMA/DD"},{"name":"ZDTEL_CUSTOMER_ID","type":"DTEL/DE"},{"name":"ZDTEL_CUSTOMER_NAME","type":"DTEL/DE"},{"name":"ZT_CUSTOMER","type":"TABL/DT"},{"name":"ZT_CUSTOMER_D","type":"TABL/DT"},{"name":"ZI_CUSTOMER","type":"DDLS/DF"},{"name":"ZC_CUSTOMER","type":"DDLS/DF"},{"name":"ZC_CUSTOMER","type":"BDEF/BD"},{"name":"ZBP_CUSTOMER","type":"BDEF/BDO"},{"name":"ZC_CUSTOMER","type":"DDLX/EX"}],"preaudit":true}
```

**Response**:
```json
{"success":true,"objects_count":11,"objects":[{"name":"ZDOMAIN_CUSTOMER_ID","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_customer_id"},{"name":"ZDOMAIN_CUSTOMER_NAME","type":"DOMA/DD","uri":"/sap/bc/adt/ddic/domains/zdomain_customer_name"},{"name":"ZDTEL_CUSTOMER_ID","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_customer_id"},{"name":"ZDTEL_CUSTOMER_NAME","type":"DTEL/DE","uri":"/sap/bc/adt/ddic/dataelements/zdtel_customer_name"},{"name":"ZT_CUSTOMER","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_customer"},{"name":"ZT_CUSTOMER_D","type":"TABL/DT","uri":"/sap/bc/adt/ddic/tables/zt_customer_d"},{"name":"ZI_CUSTOMER","type":"DDLS/DF","uri":"/sap/bc/adt/ddic/ddl/sources/zi_customer"},{"name":"ZC_CUSTOMER","type":"DDLS/DF","uri":"/sap/bc/adt/ddic/ddl/sources/zc_customer"},{"name":"ZC_CUSTOMER","type":"BDEF/BD","uri":"/sap/bc/adt/behavior/definitions/zc_customer"},{"name":"ZBP_CUSTOMER","type":"BDEF/BDO","uri":"/sap/bc/adt/behavior/implementations/zbp_customer"},{"name":"ZC_CUSTOMER","type":"DDLX/EX","uri":"/sap/bc/adt/ddic/ddlx/extensions/zc_customer"}],"activation":{"activated":true,"checked":true,"generated":false},"messages":[],"warnings":[],"errors":[],"message":"Successfully activated 11 object(s)"}
```

---

## Step 11: Create Service Definition

**Tool**: `CreateServiceDefinition`

**Request**:
```json
{"service_definition_name":"ZSD_CUSTOMER","description":"Customer Service Definition","package_name":"ZOK_LAB","transport_request":"E19K905635","source_code":"@EndUserText.label: 'Customer Service Definition'\ndefine service ZSD_CUSTOMER {\n  expose ZC_CUSTOMER as Customer;\n}","activate":true}
```

**Response**:
```json
{"success":true,"service_definition_name":"ZSD_CUSTOMER","uri":"/sap/bc/adt/core/srvb/srvbdefinitions/zsd_customer","message":"Service definition ZSD_CUSTOMER created and activated successfully"}
```

---

## Complete Workflow Summary

```
1. CreateDomain (activate: false) × N
2. CreateDataElement (activate: false) × N
3. CreateTable - Root (activate: false)
4. CreateTable - Draft (activate: false)
5. CreateView - Interface (activate: false)
6. CreateView - Consumption (activate: false)
7. CreateBehaviorDefinition (activate: false)
8. CreateBehaviorImplementation (activate: false)
9. CreateMetadataExtension (activate: false)
10. ActivateObjectLow - Group activation of all objects
11. CreateServiceDefinition (activate: true)
```

## Important Notes

- **Always set activate: false** for steps 1-9
- **Group activation** ensures proper dependency resolution
- **Service definition** can be activated immediately (depends on already activated views)
- **Order matters**: Create in dependency order
- **Code checking**: When using low-level handlers, always check code before update

