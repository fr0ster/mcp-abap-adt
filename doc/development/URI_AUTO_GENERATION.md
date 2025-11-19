# URI Auto-Generation for Activation

## Summary

URI для активації тепер **автоматично генерується** з імені та типу об'єкта. Не потрібно вказувати URI вручну!

## Зміни

### ✅ Централізована функція `buildObjectUri`

**Файл**: `src/lib/activationUtils.ts`

Функція `buildObjectUri()` тепер експортується з `activationUtils` і використовується:
- ✅ Груповою активацією (`handleActivateObject`)
- ✅ Індивідуальною активацією (`activateObjectInSession`)

### ✅ Єдине джерело правди

Коли додається новий тип об'єкта:
1. Додати mapping в `buildObjectUri()` в `activationUtils.ts`
2. Автоматично працює для обох типів активації

## Конфігурація

### До (старий спосіб - з URI):
```yaml
activate_object:
  objects:
    - name: "ZOK_I_MARKET_0001"
      uri: "/sap/bc/adt/ddic/ddl/sources/zok_i_market_0001"  # ❌ Не потрібно!
      type: "DDLS/DF"
```

### Після (новий спосіб - без URI):
```yaml
activate_object:
  objects:
    - name: "ZOK_I_MARKET_0001"
      type: "DDLS/DF"  # ✅ URI генерується автоматично!
```

## Приклад для 3 CDS Views

```yaml
activate_object:
  objects:
    - name: "ZOK_I_MARKET_0001"
      type: "DDLS/DF"
    - name: "ZOK_I_ORDER_0001"
      type: "DDLS/DF"
    - name: "ZOK_I_PRODUCT_0001"
      type: "DDLS/DF"
  preaudit: false
```

## Підтримувані типи

| Type Code | Auto-Generated URI Pattern |
|-----------|----------------------------|
| `CLAS/OC` | `/sap/bc/adt/oo/classes/{name}` |
| `PROG/P` | `/sap/bc/adt/programs/programs/{name}` |
| `DDLS/DF` | `/sap/bc/adt/ddic/ddl/sources/{name}` |
| `TABL/DT` | `/sap/bc/adt/ddic/tables/{name}` |
| `STRU/DS` | `/sap/bc/adt/ddic/structures/{name}` |
| `INTF/OI` | `/sap/bc/adt/oo/interfaces/{name}` |
| `DTEL/DE` | `/sap/bc/adt/ddic/dataelements/{name}` |
| `DOMA/DD` | `/sap/bc/adt/ddic/domains/{name}` |
| `VIEW/DV` | `/sap/bc/adt/ddic/views/{name}` |
| `FUGR` | `/sap/bc/adt/functions/groups/{name}` |

## Додавання нового типу

Щоб додати підтримку нового типу об'єкта:

1. Відкрити `src/lib/activationUtils.ts`
2. Додати case в функцію `buildObjectUri()`:

```typescript
case 'NEW_TYPE/XX':
case 'NEW_TYPE':
  return `/sap/bc/adt/path/to/new/type/${lowerName}`;
```

3. Зібрати проект: `npm run build`
4. Готово! Працює для обох типів активації

## Переваги

✅ **DRY принцип** - код не дублюється  
✅ **Єдине джерело правди** - один mapping для всіх  
✅ **Простіша конфігурація** - тільки name + type  
✅ **Легше підтримувати** - зміни в одному місці  
✅ **Менше помилок** - не потрібно вручну писати URI

## Зворотна сумісність

URI все ще можна вказати вручну (опціонально):
```yaml
activate_object:
  objects:
    - name: "MY_OBJECT"
      type: "CLAS/OC"
      uri: "/custom/uri/path"  # Опціонально, якщо потрібен custom URI
```

Але в більшості випадків це не потрібно - auto-generation працює!
