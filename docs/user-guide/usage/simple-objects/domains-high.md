# Creating and Updating ABAP Domains (High-Level)

## Create Domain

**Tool**: `CreateDomain`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","description":"Test domain","package_name":"ZOK_LAB","transport_request":"E19K905635","datatype":"CHAR","length":10,"decimals":0,"lowercase":false,"sign_exists":false,"activate":true,"fixed_values":[{"low":"001","text":"Value 001"},{"low":"002","text":"Value 002"}]}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","uri":"/sap/bc/adt/ddic/domains/zdomain_test_001","message":"Domain ZDOMAIN_TEST_001 created and activated successfully"}
```

---

## Update Domain

**Tool**: `UpdateDomain`

**Request**:
```json
{"domain_name":"ZDOMAIN_TEST_001","description":"Updated test domain","datatype":"CHAR","length":20,"decimals":0,"activate":true}
```

**Response**:
```json
{"success":true,"domain_name":"ZDOMAIN_TEST_001","uri":"/sap/bc/adt/ddic/domains/zdomain_test_001","message":"Domain ZDOMAIN_TEST_001 updated and activated successfully"}
```

