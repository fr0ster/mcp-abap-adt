# ABAP Parser Command Line Tools

Утилітні скрипти для швидкого парсингу ABAP коду з командного рядка.

## 🔧 Доступні скрипти

### 1. `parse-abap-code.js` - Детальний парсер з поясненнями

**Використання:**
```bash
node parse-abap-code.js "DATA: lv_test TYPE string."
```

**Вивід:**
```
🔧 ABAP CODE PARSER
==================
📝 Input: DATA: lv_test TYPE string.

📊 AST PARSING:
   Length: 25, Lines: 1
   Classes: 0, Methods: 0
   Data: 1, Forms: 0
   Includes: 0

🔍 SEMANTIC ANALYSIS:
   Symbols: 1
   Dependencies: 0
   Scopes: 0
   Errors: 0
   Complexity: 1
   Max Depth: 0
   📋 SYMBOLS:
      LV_TEST (variable) line:1 public

🌐 SYSTEM SYMBOLS:
   Total: 1
   Resolution: 0%
```

### 2. `parse-abap-raw.js` - Мінімальний вивід без пояснень

**Використання:**
```bash
node parse-abap-raw.js "CLASS lcl_test DEFINITION. ENDCLASS."
```

**Вивід:**
```
=== AST ===
Length: 35
Lines: 1
Classes: 1
Methods: 0
Data: 0
Forms: 0
Includes: 0

=== SEMANTIC ===
Symbols: 1
Dependencies: 0
Scopes: 1
Errors: 0
Complexity: 1
Depth: 0

SYMBOLS:
LCL_TEST|class|1|global|public

=== SYSTEM ===
Total: 1
Resolution: 0%

SCOPES:
LCL_TEST|class|1-1|none
```

### 3. `parse-abap-json.js` - Повний JSON для програмного використання

**Використання:**
```bash
node parse-abap-json.js "FORM test USING p TYPE string. ENDFORM."
```

**Вивід:** Повний JSON з усіма результатами парсингу (AST, семантичний аналіз, системні символи)

## 📋 Формати виводу

### Символи (SYMBOLS)
Формат: `NAME|TYPE|LINE|SCOPE|VISIBILITY`

- **NAME** - назва символу
- **TYPE** - тип (class, method, function, variable, constant, form, interface)
- **LINE** - номер рядка
- **SCOPE** - скоуп (global, назва класу/методу)
- **VISIBILITY** - видимість (public, protected, private, none)

### Скоупи (SCOPES)
Формат: `NAME|TYPE|STARTLINE-ENDLINE|PARENT`

- **NAME** - назва скоупу
- **TYPE** - тип скоупу (global, class, method, form, function)
- **STARTLINE-ENDLINE** - діапазон рядків
- **PARENT** - батьківський скоуп (none для глобального)

## 🚀 Приклади використання

### Парсинг простої змінної
```bash
node parse-abap-raw.js "DATA: gv_counter TYPE i."
```

### Парсинг класу
```bash
node parse-abap-code.js "CLASS zcl_test DEFINITION. PUBLIC SECTION. METHODS: run. ENDCLASS."
```

### Парсинг форми з параметрами
```bash
node parse-abap-raw.js "FORM validate USING p_input TYPE string CHANGING p_output TYPE string. ENDFORM."
```

### Отримання JSON для обробки в іншій програмі
```bash
node parse-abap-json.js "INTERFACE lif_test. METHODS: process. ENDINTERFACE." > result.json
```

### Парсинг функції
```bash
node parse-abap-code.js "FUNCTION z_calculate. DATA: lv_result TYPE i. ENDFUNCTION."
```

## 🔍 Що аналізується

### AST (Abstract Syntax Tree)
- **Length** - довжина коду в символах
- **Lines** - кількість рядків
- **Classes** - кількість класів
- **Methods** - кількість методів
- **Data** - кількість декларацій даних
- **Forms** - кількість форм
- **Includes** - кількість include'ів

### Семантичний аналіз
- **Symbols** - загальна кількість символів
- **Dependencies** - кількість залежностей (includes)
- **Scopes** - кількість скоупів
- **Errors** - кількість помилок парсингу
- **Complexity** - циклматична складність
- **Depth** - максимальна глибина вкладеності

### Системні символи
- **Total** - загальна кількість символів
- **Resolution** - відсоток розв'язаних з SAP системи
- **Dependencies** - список залежностей
- **Scopes** - ієрархія скоупів

## 🛠️ Налагодження

### Перевірити чи працює парсер
```bash
make build
node parse-abap-raw.js "DATA: test TYPE string."
```

### Якщо помилка "Cannot find module"
```bash
# Перевірити чи існують скомпільовані файли
ls -la ../dist/handlers/

# Якщо немає - зібрати проект
cd ..
make build
cd tools
```

### Тестування з різними конструкціями ABAP
```bash
# Простий тест
node parse-abap-raw.js "CONSTANTS: gc_test TYPE i VALUE 42."

# Складніший тест
node parse-abap-code.js "
CLASS lcl_demo DEFINITION.
  PUBLIC SECTION.
    METHODS: test IMPORTING iv_param TYPE string.
ENDCLASS."
```

## 💡 Поради

1. **Використайте лапки** для передачі ABAP коду як параметра
2. **parse-abap-raw.js** - для швидкого аналізу без зайвої інформації
3. **parse-abap-json.js** - для інтеграції з іншими програмами
4. **parse-abap-code.js** - для детального аналізу з поясненнями
5. Результати можна **перенаправити у файл**: `> output.txt`
6. JSON можна **обробити через jq**: `| jq '.semantic.symbols'`

## 🎯 Інтеграція з іншими інструментами

### Bash скрипт для пакетного парсингу
```bash
#!/bin/bash
for file in *.abap; do
    echo "Parsing $file"
    node parse-abap-raw.js "$(cat $file)"
done
```

### Python інтеграція
```python
import subprocess
import json

def parse_abap_code(code):
    result = subprocess.run(['node', 'parse-abap-json.js', code], 
                          capture_output=True, text=True)
    return json.loads(result.stdout)

symbols = parse_abap_code("DATA: test TYPE string.")
print(f"Found {len(symbols['semantic']['symbols'])} symbols")
