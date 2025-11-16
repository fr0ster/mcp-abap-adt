# Перелік MCP Handlers по групах

**Всього handlers: 67**

## 1. Programs, classes, functions

1. GetClass
2. GetFunction
3. GetFunctionGroup
4. GetProgram

## 2. Tables, structures

5. GetStructure
6. GetTable
7. GetTableContents

## 3. Packages, interfaces

8. GetInterface
9. GetPackage
10. CreatePackage

## 4. Includes, hierarchies

11. GetInclude
12. GetIncludesList
13. GetObjectStructure

## 5. Types, descriptions, metadata

14. GetAdtTypes
15. GetTypeInfo
16. GetObjectInfo

## 6. Search, SQL, transactions

17. GetSqlQuery
18. GetTransaction
19. SearchObject
20. GetWhereUsed

## 7. Enhancement

21. GetBdef
22. GetEnhancementImpl
23. GetEnhancements
24. GetEnhancementSpot

## 8. ABAP Parser & Semantic Analysis

25. GetAbapAST
26. GetAbapSemanticAnalysis
27. GetAbapSystemSymbols

## 9. Domain management

28. GetDomain
29. CreateDomain
30. UpdateDomain

## 10. Data Element management

31. GetDataElement
32. CreateDataElement
33. UpdateDataElement

## 11. Transport management

34. GetTransport
35. CreateTransport

## 12. Table and Structure management

36. CreateTable
37. CreateStructure

## 13. Class management

38. CreateClass
39. UpdateClassSource

## 14. Program management

40. CreateProgram
41. UpdateProgramSource

## 15. Interface management

42. CreateInterface
43. UpdateInterfaceSource

## 16. Function Group management

44. CreateFunctionGroup

## 17. Function Module management

45. CreateFunctionModule
46. UpdateFunctionModuleSource

## 18. View management

47. CreateView
48. GetView
49. UpdateViewSource

## 19. Session management

50. GetSession

## 20. Universal object operations (work with all object types)

### Lock/Unlock (available for: class, program, interface, function_group, function_module, table, structure, view, domain, data_element, package)

51. LockObject - Lock any ABAP object for modification
52. UnlockObject - Unlock any ABAP object

### Activation (available for: class, program, interface, function_group, function_module, table, structure, view, domain, data_element)

53. ActivateObject - Activate one or multiple ABAP objects

### Validation (available for: class, table, function_module, interface, program, function_group, view, structure, package)

54. ValidateObject - Generic object name validation

### Syntax checking (available for: class, program, interface, function_module, table, structure, view, domain, data_element, package)

55. CheckObject - Generic syntax check for any object type

## 21. Class-specific validation and checking

56. ValidateClass - Class-specific validation with superclass support
57. CheckClass - Class-specific syntax checking

## 22. Table-specific validation and checking

58. ValidateTable - Table-specific validation
59. CheckTable - Table-specific syntax checking

## 23. Function module-specific validation and checking

60. ValidateFunctionModule - Function module-specific validation (requires function_group_name)
61. CheckFunctionModule - Function module-specific syntax checking (requires function_group_name)

## 24. Deletion

62. DeleteObject - Delete any ABAP object (works with all object types)

## 25. Dynamically imported tools

63. GetObjectsByType
64. GetObjectsList
65. GetProgFullCode
66. GetObjectNodeFromCache
67. DescribeByList

