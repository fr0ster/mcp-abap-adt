# Test System Setup Checklist

## 📋 Обов'язкові налаштування перед тестуванням

Перед запуском тестів необхідно налаштувати `test-config.yaml` з реальними значеннями для вашої тестової системи.

### 1. Створити test-config.yaml

```bash
cd submodules/mcp-abap-adt/tests
cp test-config.yaml.template test-config.yaml
```

### 2. Оновити Environment Configuration

У секції `environment` в `test-config.yaml`:

```yaml
environment:
  env: "e19.env"                # ⚠️ Ім'я .env файлу зі стандартної папки sessions
  system_type: "onprem"         # ⚠️ "onprem" | "cloud" | "legacy"
  connection_type: "http"       # "http" | "rfc" (rfc для legacy)
  default_package: "TEST_MCP"   # ⚠️ Оновити на ваш пакет
  default_transport: ""         # ⚠️ Transport request або "" для локальних пакетів
```

Файл `.env` розташовується у стандартній папці sessions:
- **Windows**: `~/Documents/mcp-abap-adt/sessions/e19.env`
- **Unix/macOS**: `~/.config/mcp-abap-adt/sessions/e19.env`

### 3. Оновити Transport Requests

Знайти та замінити всі `<YOUR_TRANSPORT_REQUEST>` на реальний номер transport request:

**Місця, де потрібно оновити transport_request:**

- ✅ `create_domain.transportable_char_domain` (рядок 51)
- ✅ `create_data_element.basic_data_element` (рядок 68)
- ✅ `update_data_element.update_transportable_data_element` (рядок 108)
- ✅ `create_package.basic_package` (рядок 198)
- ✅ `create_view` (рядок 279)
- ✅ `create_cds` (рядок 293)
- ✅ `create_class` (рядок 319)
- ✅ `create_program` (рядок 348)
- ✅ `delete_object.delete_test_interface` (рядок 496)

**Як отримати transport request:**
```bash
# Через MCP tool GetTransport або вручну через SE01/SE09
# Створити новий workbench transport через create_transport tool
```

### 4. Оновити Package Names

Перевірити, що пакети існують у вашій системі:

- `ZOK_LOCAL` - використовується для transportable об'єктів
- `ZOK_PACKAGE` - використовується як super_package для create_package
- `$TMP` - локальний пакет (завжди доступний, не потребує transport)

**Якщо пакети не існують:**
- Використовувати `$TMP` для тестів (не потребує transport)
- Або створити пакети через `create_package` tool
- Або оновити назви на існуючі пакети у вашій системі

### 5. Оновити Transport Layer

У `create_package.basic_package`:

```yaml
transport_layer: "ZE19"  # ⚠️ Оновити на ваш transport layer
```

**Як дізнатися transport layer:**
- Перевірити в існуючому пакеті через SE80 або ADT
- Або використати стандартний для вашої системи (наприклад, "ZE19", "ZDEV")

### 6. Оновити Target System

У `create_transport.workbench_transport`:

```yaml
target_system: "QAS"  # ⚠️ Оновити на вашу target system
```

### 7. Оновити Transport Number для GET тестів

У `get_transport.existing_transport`:

```yaml
transport_number: "<YOUR_TRANSPORT_NUMBER>"  # ⚠️ Оновити на реальний номер
```

### 8. Перевірити Object Names

Деякі тести використовують стандартні об'єкти SAP (MARA, T000, SAPMV45A) - вони мають бути доступні у вашій системі.

**GET тести використовують стандартні об'єкти:**
- `get_program`: "SAPMV45A"
- `get_class`: "CL_ABAP_TYPEDESCR"
- `get_function`: "RFC_READ_TABLE" (function group: "SRFC")
- `get_table`: "MARA", "T000"
- `get_package`: "$TMP"

Якщо якісь об'єкти недоступні, оновіть назви на доступні у вашій системі.

### 9. Оновити Object Names для CREATE тестів

Перевірити, що об'єкти з префіксом `ZZ_` або `ZOK_` не конфліктують з існуючими:

- `ZZ_TEST_MCP_01`, `ZZ_TMP_DOMAIN_01` - для domain
- `ZCL_TEST_MCP_01` - для class
- `Z_TEST_PROGRAM_01` - для program
- `ZOK_TEST_PKG_01` - для package
- `ZV_TEST_MCP_VIEW_01` - для view
- `Z_I_TEST_MCP_CDS_01` - для CDS view

**Рекомендація:** Використовувати унікальні префікси або додати timestamp до назв.

### 10. Налаштувати Test Settings

У секції `test_settings`:

```yaml
test_settings:
  fail_fast: false  # Зупинятися на першій помилці
  verbose: true     # Детальний вивід
  timeout: 30000    # Timeout для тестів (мс)
  retry_on_failure: false
  max_retries: 1
  cleanup_after_test: false  # Чи видаляти тестові об'єкти після тесту
```

## ✅ Чеклист перед запуском тестів

- [ ] Створено `test-config.yaml` з template
- [ ] Оновлено `environment.default_transport` на реальний transport request
- [ ] Оновлено `environment.default_package` на існуючий пакет
- [ ] Оновлено `environment.default_system` на вашу систему
- [ ] Оновлено `environment.default_client` на ваш клієнт
- [ ] Оновлено всі `<YOUR_TRANSPORT_REQUEST>` на реальні номери
- [ ] Оновлено `transport_layer` у create_package
- [ ] Оновлено `target_system` у create_transport
- [ ] Перевірено, що пакети (`ZOK_LOCAL`, `ZOK_PACKAGE`) існують або використовується `$TMP`
- [ ] Перевірено, що стандартні об'єкти доступні (MARA, T000, SAPMV45A)
- [ ] Перевірено, що тестові об'єкти (ZZ_*, ZOK_*) не конфліктують з існуючими

## 🚀 Запуск тестів

### Тести з $TMP (не потребують transport)

```bash
# Увімкнути тести з enabled: true для $TMP пакету
# Наприклад, create_domain.local_char_domain
node tests/test-create-domain.js
```

### Тести з transportable пакетами

```bash
# Спочатку створити transport request
node tests/test-create-transport.js

# Потім оновити test-config.yaml з новим transport request
# І запустити тести
node tests/test-create-domain.js
```

### Всі увімкнені тести

```bash
node tests/run-all-tests.js
```

## 📝 Примітки

1. **$TMP пакет** - найпростіший варіант для тестування, не потребує transport request
2. **Transport requests** - створюються через `create_transport` tool або вручну через SE01/SE09
3. **Package names** - можна використовувати будь-які існуючі пакети у вашій системі
4. **Object names** - переконайтеся, що префікси (ZZ_, ZOK_) дозволені у вашій системі

## 🔍 Перевірка конфігурації

Після налаштування перевірте:

```bash
# Перевірити, що test-config.yaml завантажується
node -e "const {loadTestConfig} = require('./tests/test-helper'); console.log(loadTestConfig());"
```

## ⚠️ Важливо

- `test-config.yaml` містить реальні значення - **НЕ комітити в Git!**
- Використовуйте `test-config.yaml.template` як шаблон
- Додайте `test-config.yaml` в `.gitignore` якщо ще не додано

