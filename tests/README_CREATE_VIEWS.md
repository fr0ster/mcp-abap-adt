# Тести для CreateView та CreateCDS

Цей документ описує, як використовувати тести для створення ABAP Views та CDS Views.

## Підготовка

### 1. Налаштування test-config.yaml

Всі параметри тестів беруться з `tests/test-config.yaml`. Відредагуйте цей файл перед запуском тестів:

```yaml
# Database View (через DDL Source)
create_view:
  view_name: "ZV_TEST_MCP_VIEW_01"
  description: "Test Database View created via MCP"
  package_name: "ZOK_LOCAL"
  transport_request: "E19K905635"  # ⚠️ ОНОВІТЬ ПЕРЕД ТЕСТУВАННЯМ
  ddl_source: |
    @EndUserText.label : 'Test Database View for Materials'
    @AbapCatalog.sqlViewName : 'ZV_TEST_MCP_V1'
    define view ZV_TEST_MCP_VIEW_01
      as select from mara
        inner join makt
          on mara.matnr = makt.matnr
    {
      key mara.matnr as Material,
          mara.mtart as MaterialType,
          makt.maktx as MaterialDescription,
          mara.meins as BaseUnit
    }
    where makt.spras = 'E'

# CDS View (DDLS/DDL Source)
create_cds:
  cds_name: "Z_I_TEST_MCP_CDS_01"
  description: "Test CDS View created via MCP"
  package_name: "ZOK_LOCAL"
  transport_request: "E19K905635"  # ⚠️ ОНОВІТЬ ПЕРЕД ТЕСТУВАННЯМ
  ddl_source: |
    @AbapCatalog.viewEnhancementCategory: [#NONE]
    @AccessControl.authorizationCheck: #NOT_REQUIRED
    @EndUserText.label: 'Test CDS View for Materials'
    define view Z_I_TEST_MCP_CDS_01
      as select from mara
    {
      key matnr as Material,
          mtart as MaterialType,
          meins as BaseUnitOfMeasure
    }
```

## Приклади DDL Source

### Database View (для CreateView)

**Простий view з однієї таблиці:**
```abap
@EndUserText.label : 'Materials View'
@AbapCatalog.sqlViewName : 'ZV_MATERIALS'
define view ZV_MATERIALS_VIEW
  as select from mara
{
  key matnr as Material,
      mtart as MaterialType,
      meins as BaseUnit
}
```

**View з JOIN:**
```abap
@EndUserText.label : 'Materials with Description'
@AbapCatalog.sqlViewName : 'ZV_MAT_DESC'
define view ZV_MAT_DESC_VIEW
  as select from mara
    inner join makt
      on mara.matnr = makt.matnr
{
  key mara.matnr as Material,
      mara.mtart as MaterialType,
      makt.maktx as Description,
      makt.spras as Language
}
where makt.spras = 'E'
```

**View з WHERE умовою:**
```abap
@EndUserText.label : 'Finished Products'
@AbapCatalog.sqlViewName : 'ZV_FERT'
define view ZV_FERT_VIEW
  as select from mara
{
  key matnr as Material,
      mtart as MaterialType,
      ersda as CreatedOn
}
where mtart = 'FERT'
```

### CDS View (для CreateCDS)

**Базовий CDS View:**
```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Materials CDS View'
define view Z_I_Materials
  as select from mara
{
  key matnr as Material,
      mtart as MaterialType,
      meins as BaseUnitOfMeasure,
      ersda as CreatedOn
}
```

**CDS View з асоціацією:**
```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Materials with Text'
define view Z_I_Materials_Text
  as select from mara
  association [0..*] to makt as _Text
    on $projection.Material = _Text.matnr
{
  key matnr as Material,
      mtart as MaterialType,
      meins as BaseUnitOfMeasure,
      _Text
}
```

**CDS View з параметрами:**
```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Materials by Type'
define view Z_I_Materials_By_Type
  with parameters
    p_mtart : abap.char(4)
  as select from mara
{
  key matnr as Material,
      mtart as MaterialType,
      meins as BaseUnitOfMeasure
}
where mtart = :p_mtart
```

## Запуск тестів

### Тест CreateView (класичний Database View)

```bash
node tests/test-create-view.js
```

Цей тест створює класичний ABAP Database View (як в SE11) з:
- Базовими таблицями
- JOIN умовами
- Вибраними полями
- WHERE умовами

### Тест CreateCDS (сучасний CDS View)

```bash
node tests/test-create-cds.js
```

Цей тест створює сучасний CDS View (DDLS) з:
- DDL source кодом
- Анотаціями
- Підтримкою асоціацій
- Параметрами

## Структура тестів

Обидва тести використовують однакову структуру:

1. **Ініціалізація середовища** через `test-helper.js`
   - Завантажує змінні середовища
   - Запобігає авто-запуску MCP server

2. **Завантаження конфігурації** з `test-config.yaml`
   - Читає параметри тесту
   - Валідує наявність необхідних полів

3. **Виконання тесту**
   - Викликає відповідний handler
   - Виводить результати
   - Обробляє помилки

## Приклад виводу

### Успішне виконання:

```
================================================================================
CreateView Handler Test (ABAP Database View)
================================================================================
📋 Test Parameters:
   View Name: ZTST_DEMO_VIEW
   Description: Test Demo View for MCP ABAP ADT
   Package: ZOK_LOCAL
   Transport: E19K905635
   Base Tables: MARA, MAKT
   View Type: database

🚀 Creating database view...

✅ View creation completed!
{
  "success": true,
  "view_name": "ZTST_DEMO_VIEW",
  "package_name": "ZOK_LOCAL",
  "message": "Database view ZTST_DEMO_VIEW created successfully"
}
```

### Помилка виконання:

```
❌ View creation failed:
Error: Transport request E19K905635 is locked or does not exist
```

## Особливості

### CreateView
- Працює з класичними Database Views (DDIC)
- Підтримує різні типи view: database, projection, maintenance
- Автоматично генерує XML для ADT API

### CreateCDS
- Створює CDS Views через DDL Source (DDLS)
- Повна підтримка DDL синтаксису
- Автоматична активація після створення
- Підтримка всіх CDS анотацій

## Troubleshooting

### "Missing create_view configuration"
Додайте секцію `create_view:` до `test-config.yaml`

### "CSRF token could not be fetched"
Перевірте підключення до SAP системи та права доступу

### "Transport request is locked"
Використовуйте активний транспорт або змініть на `$TMP` для локального тестування

## Інтеграція з іншими тестами

Всі тести в проекті використовують `test-helper.js` та `test-config.yaml` для:
- Централізованого управління конфігурацією
- Уніфікованої ініціалізації середовища
- Спільного використання налаштувань

Приклади інших тестів:
- `test-create-table.js` - створення таблиць
- `test-create-domain.js` - створення доменів
- `test-create-data-element.js` - створення елементів даних
