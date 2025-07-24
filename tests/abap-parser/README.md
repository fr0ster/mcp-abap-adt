# ABAP Parser Tests

Цей каталог містить тестові скрипти для ABAP парсера та його інтеграції з SAP системою.

## 📋 Доступні тести

### 1. **test-all-handlers.js** - Загальний тест всіх хендлерів
**Призначення:** Комплексне тестування всіх трьох ABAP хендлерів
**Що тестує:**
- `handleGetAbapAST` - генерація AST дерева
- `handleGetAbapSemanticAnalysis` - семантичний аналіз
- `handleGetAbapSystemSymbols` - розв'язування символів

**Запуск:**
```bash
cd tests/abap-parser
node test-all-handlers.js
```

**Тестовий код:** Комплексна ABAP програма з класами, методами, формами, функціями

### 2. **test-system-symbols-demo.js** - Демонстрація системних символів
**Призначення:** Детальна демонстрація JSON структури відповіді GetAbapSystemSymbols
**Що показує:**
- Повну структуру JSON відповіді
- Режими роботи (з/без SAP підключення)
- Детальне пояснення всіх полів
- Приклади налаштувань

**Запуск:**
```bash
cd tests/abap-parser
node test-system-symbols-demo.js
```

### 3. **test-salv-table-resolution.js** - Тест з CL_SALV_TABLE
**Призначення:** Демонстрація роботи з реальним SAP класом CL_SALV_TABLE
**Що тестує:**
- Розв'язування CL_SALV_TABLE з SAP системи
- Отримання методів та інтерфейсів
- Інформацію про пакет та опис
- Пов'язані SALV класи

**Запуск:**
```bash
cd tests/abap-parser
node test-salv-table-resolution.js
```

**Очікуваний результат:** Детальна інформація про CL_SALV_TABLE з SAP системи

## 🚀 Підготовка до тестування

### 1. Збірка проекту
```bash
# З кореня проекту
make build
```

### 2. Налаштування ANTLR4 (опціонально)
```bash
make setup
make generate
```

### 3. Перевірка залежностей
```bash
npm install
```

## 📊 Очікувані результати

### test-all-handlers.js
```
✅ AST Generated successfully
   - Source length: 1234
   - Line count: 56
   - Classes found: 1
   - Methods found: 4
   - Forms found: 1

✅ Semantic Analysis completed successfully
   - Symbols found: 15
   - Dependencies: 1
   - Scopes: 8
   - Complexity metrics available

✅ System Symbol Resolution completed successfully
   - Total symbols: 15
   - Resolution rate: 0.0% (без SAP підключення)
```

### test-system-symbols-demo.js
```json
{
  "symbols": [
    {
      "name": "LCL_DEMO_CLASS",
      "type": "class",
      "systemInfo": {
        "exists": false,
        "objectType": "LOCAL"
      }
    }
  ],
  "systemResolutionStats": {
    "totalSymbols": 8,
    "resolutionRate": "0.0%"
  }
}
```

### test-salv-table-resolution.js
```
🎯 Знайдені SALV класи та їх системна інформація:
1. CL_SALV_TABLE (class)
   ✅ Існує в SAP: ТАК
   - Тип об'єкта: CLAS
   - Опис: Simple ALV Table
   - Пакет: SALV
   - Методи: FACTORY, DISPLAY, GET_DISPLAY_SETTINGS...
```

## 🛠️ Налагодження

### Якщо тести не працюють:

1. **Помилка модулів:**
   ```bash
   # Перевірте чи існують скомпільовані файли
   ls -la ../../dist/handlers/
   
   # Якщо немає - зберіть проект
   cd ../..
   make build
   ```

2. **Помилки SAP підключення:**
   - Це нормально якщо не налаштована автентифікація
   - Тести працюють і без реального SAP підключення
   - Для реального підключення налаштуйте змінні середовища

3. **Помилки парсингу:**
   ```bash
   # Перегенеруйте парсер
   cd ../..
   make clean
   make generate
   make build
   ```

## 📝 Структура тестових даних

### Базовий ABAP код (test-all-handlers.js):
- REPORT програма
- Клас з публічними та приватними секціями
- Методи з параметрами
- DATA декларації
- FORM та FUNCTION
- INCLUDE залежність

### Демонстраційний код (test-system-symbols-demo.js):
- Простіший код для демонстрації структури
- Всі основні ABAP конструкції
- Оптимізований для читабельності

### SALV приклад (test-salv-table-resolution.js):
- Реальний код використання CL_SALV_TABLE
- REF TO декларації
- Статичні та методи екземпляру
- TRY-CATCH обробка помилок

## 🎯 Розширення тестів

Для додавання нових тестів:

1. Створіть новий `.js` файл в цьому каталозі
2. Використайте шлях `../../dist/handlers/` для імпортів
3. Додайте опис у цей README
4. Тестуйте з різними ABAP кодами

## 💡 Корисні команди

```bash
# Запуск всіх тестів послідовно
for test in test-*.js; do echo "=== $test ==="; node "$test"; echo; done

# Тест з детальним логом
DEBUG=1 node test-all-handlers.js

# Тест тільки локальних символів
node -e "
const test = require('./test-system-symbols-demo.js');
// Можна змінити параметри тестування
"

# Перевірка структури відповідей
node test-system-symbols-demo.js | grep -A 20 "JSON відповідь"
