# TODO Roadmap - mcp-abap-adt-v2

## Загальна статистика
- **Всього TODO**: 15
- **Файлів з TODO**: 14
- **Статус**: Всі хендлери функціональні, TODO - технічний борг для рефакторингу

---

## Категорія 1: Міграція на ReadOnlyClient Infrastructure (11 TODOs)

### Пріоритет: Medium
**Ціль**: Уніфікувати всі read-only операції через ReadOnlyClient замість прямих ADT запитів

### System Handlers (7 TODOs)
- [ ] `handlers/system/readonly/handleGetAllTypes.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetObjectInfo.ts` - Migrate to infrastructure module  
- [ ] `handlers/system/readonly/handleGetObjectNodeFromCache.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetObjectStructure.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetSqlQuery.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetTypeInfo.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetWhereUsed.ts` - Migrate to infrastructure module

**План міграції**:
1. Додати відповідні методи в ReadOnlyClient (@mcp-abap-adt/clients)
2. Замінити `makeAdtRequestWithTimeout` на ReadOnlyClient методи
3. Перевірити що всі edge cases покриті
4. Зберегти зворотну сумісність з існуючими викликами

**Оцінка**: 2-3 дні на всі system handlers

### Domain Handlers (4 TODOs)
- [ ] `handlers/behavior_definition/readonly/handleGetBdef.ts` - Migrate to infrastructure module
- [ ] `handlers/include/readonly/handleGetInclude.ts` - Migrate to infrastructure module
- [ ] `handlers/package/readonly/handleGetPackage.ts` - Migrate to infrastructure module
- [ ] `handlers/transport/readonly/handleGetTransport.ts` - Migrate to infrastructure module or enhance ReadOnlyClient.readTransport()

**План міграції**:
1. Перевірити чи є відповідні методи в ReadOnlyClient
2. Якщо немає - додати їх спочатку
3. Мігрувати хендлери по одному
4. Тестувати з реальними ABAP системами

**Оцінка**: 1-2 дні

---

## Категорія 2: Додавання методів в ReadOnlyClient (3 TODOs)

### Пріоритет: High (блокують міграцію handlers)
**Ціль**: Розширити ReadOnlyClient API для покриття всіх use cases

### TODO у lib/utils.ts (2 TODOs)
- [ ] **Line 835**: Add `fetchNodeStructure()` to ReadOnlyClient
  - **Використовується в**: `getNodeStructureWithTimeout()`
  - **Endpoint**: `/sap/bc/adt/repository/nodestructure`
  - **План**: Додати метод `readNodeStructure()` в ReadOnlyClient
  - **Оцінка**: 2-4 години

- [ ] **Line 858**: Add `getSystemInformation()` to ReadOnlyClient
  - **Використовується в**: `getSystemInformation()`
  - **Endpoint**: `/sap/bc/adt/discovery`
  - **План**: Додати метод `readSystemInfo()` в ReadOnlyClient
  - **Оцінка**: 2-4 години

### TODO у handlers (1 TODO)
- [ ] **handlers/table/readonly/handleGetTableContents.ts** (Line 19): Implement using ReadOnlyClient.readTableContents() when method is added
  - **Зараз**: Використовує `makeAdtRequestWithTimeout` напряму
  - **Потрібно**: Додати `readTableContents()` в ReadOnlyClient
  - **Endpoint**: `/sap/bc/adt/datapreview/freestyle?...`
  - **Оцінка**: 3-5 годин

**План дій**:
1. Створити issue в @mcp-abap-adt/clients для кожного методу
2. Імплементувати методи в ReadOnlyClient
3. Опублікувати нову версію @mcp-abap-adt/clients
4. Оновити mcp-abap-adt до нової версії clients
5. Мігрувати відповідні хендлери

**Загальна оцінка**: 1-2 дні

---

## Категорія 3: Feature Enhancement (1 TODO)

### Пріоритет: Low
**Ціль**: Покращити функціональність створення структур

- [ ] **handlers/structure/high/handleCreateStructure.ts** (Line 209): Implement DDL generation or enhance CrudClient to accept fields directly

**Деталі**:
- **Зараз**: StructureBuilder генерує DDL внутрішньо, але після створення structure не оновлюється з полями
- **Проблема**: Пропускається update після create
- **Варіанти рішення**:
  1. Імплементувати явну DDL generation в handler
  2. Розширити CrudClient щоб приймав fields при створенні
  3. Використати StructureBuilder для генерації DDL і передачі в update

**Оцінка**: 1-2 дні (залежно від вибраного підходу)

---

## Послідовність виконання (Рекомендована)

### Phase 1: Infrastructure Enhancement (Week 1)
1. ✅ Додати методи в ReadOnlyClient:
   - `readNodeStructure()`
   - `readSystemInfo()`
   - `readTableContents()`
2. ✅ Опублікувати нову версію @mcp-abap-adt/clients
3. ✅ Оновити залежність в mcp-abap-adt

### Phase 2: System Handlers Migration (Week 2)
1. ✅ Мігрувати всі 7 system handlers на ReadOnlyClient
2. ✅ Тестування з різними ABAP системами
3. ✅ Перевірити backward compatibility

### Phase 3: Domain Handlers Migration (Week 3)
1. ✅ Мігрувати behavior_definition, include, package handlers
2. ✅ Мігрувати transport handler (найскладніший)
3. ✅ Мігрувати table handler після додавання readTableContents()
4. ✅ Повне регресійне тестування

### Phase 4: Feature Enhancement (Week 4 - Optional)
1. ⭕ Аналіз вимог для DDL generation в CreateStructure
2. ⭕ Вибір архітектури (DDL gen vs CrudClient enhancement)
3. ⭕ Імплементація і тестування

---

## Метрики успіху

- [ ] Всі хендлери використовують ReadOnlyClient замість makeAdtRequestWithTimeout
- [ ] Код в lib/utils.ts зменшено на 30%+ (видалено дублюючі ADT запити)
- [ ] Покриття тестами нових методів ReadOnlyClient >= 80%
- [ ] Час виконання read-only операцій не збільшився > 5%
- [ ] Backward compatibility: старі інтеграції працюють без змін

---

## Ризики і мітігації

### Ризик 1: Breaking changes в ReadOnlyClient
**Мітігація**: Semantic versioning, deprecated warnings, migration guide

### Ризик 2: Performance degradation
**Мітігація**: Бенчмарки до/після міграції, профілювання

### Ризик 3: Edge cases в різних ABAP версіях
**Мітігація**: Тестування на NetWeaver 7.5x, S/4HANA 2020+, BTP ABAP Environment

---

## Примітки

- Всі TODO позначені як non-blocking - v2 функціональний як є
- Міграція покращить maintainability і code reuse
- Пріоритезація: спочатку блокери (ReadOnlyClient methods), потім масова міграція
- DDL generation - nice-to-have, не критичний для release

---

**Останнє оновлення**: 2025-12-19  
**Версія**: mcp-abap-adt v2.0.0  
**Статус**: Roadmap затверджений, готовий до виконання
