# Інструкція з встановлення MCP ABAP ADT Server

Цей посібник допоможе вам встановити та налаштувати MCP ABAP ADT Server для роботи з SAP ABAP системами через Model Context Protocol (MCP). Сервер дозволяє інтегрувати ABAP розробку з AI-інструментами як Cline, Cursor та GitHub Copilot.

## 📋 Зміст

1. [Передумови](#передумови)
2. [Встановлення](#встановлення)
3. [Налаштування для On-Premise SAP](#налаштування-для-on-premise-sap)
4. [Налаштування для SAP BTP Cloud](#налаштування-для-sap-btp-cloud)
5. [Підключення до Cline](#підключення-до-cline)
6. [Підключення до Cursor](#підключення-до-cursor)
7. [Підключення до GitHub Copilot](#підключення-до-github-copilot)
8. [Тестування](#тестування)
9. [Усунення проблем](#усунення-проблем)
10. [Доступні інструменти](#доступні-інструменти)

## 🔧 Передумови

### Системні вимоги
- **Node.js** версії 18 або новіше
- **npm** (встановлюється разом з Node.js)
- **Git** для клонування репозиторію
- Доступ до SAP ABAP системи (on-premise або BTP)

### SAP системні вимоги
- Активовані ADT сервіси в транзакції `SICF`:
  - `/sap/bc/adt`
- Для інструменту `GetTableContents` потрібна реалізація кастомного сервісу `/z_mcp_abap_adt/z_tablecontent`
- Відповідні авторизації для користувача SAP

### Встановлення Node.js
1. Завантажте Node.js LTS версію з [nodejs.org](https://nodejs.org/)
2. Встановіть, слідуючи інструкціям для вашої ОС
3. Перевірте встановлення:
   ```bash
   node -v
   npm -v
   ```

## 📦 Встановлення

### Автоматичне встановлення через Smithery

```bash
npx -y @smithery/cli install @mario-andreschak/mcp-abap-adt --client cline
```

### Ручне встановлення

1. **Клонування репозиторію:**
   ```bash
   git clone https://github.com/mario-andreschak/mcp-abap-adt.git
   cd mcp-abap-adt
   ```

2. **Встановлення залежностей:**
   ```bash
   npm install
   ```

3. **Збірка проекту:**
   ```bash
   npm run build
   ```

## 🏢 Налаштування для On-Premise SAP

### 1. Створення файлу конфігурації

Створіть файл `.env` в кореневій директорії проекту:

```env
# URL вашої SAP системи
SAP_URL=https://your-sap-system.com:8000

# SAP клієнт
SAP_CLIENT=100

# Мова (опціонально, за замовчуванням 'en')
SAP_LANGUAGE=en

# Тип авторизації
SAP_AUTH_TYPE=basic

# Облікові дані
SAP_USERNAME=your_username
SAP_PASSWORD=your_password

# TLS налаштування (встановіть 0 для самопідписаних сертифікатів)
TLS_REJECT_UNAUTHORIZED=0

# Налаштування таймаутів (в мілісекундах)
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

### 2. Перевірка підключення

Запустіть тестове підключення:
```bash
npm run start
```

## ☁️ Налаштування для SAP BTP Cloud

### 1. Отримання Service Key

1. Увійдіть в SAP BTP Cockpit
2. Перейдіть до вашого ABAP Environment
3. Створіть Service Key для Communication Arrangement
4. Завантажте JSON файл з ключем

### 2. Автоматична авторизація (рекомендовано)

Використовуйте вбудований інструмент для автоматичного отримання JWT токену:

```bash
node tools/sap-abap-auth-browser.js auth --key path/to/your/service-key.json --browser chrome
```

**Параметри:**
- `--key <path>`: Шлях до JSON файлу з service key
- `--browser <browser>`: Браузер для відкриття (chrome, edge, firefox, system, none)

**Що робить інструмент:**
1. Читає ваш SAP BTP service key
2. Відкриває браузер для OAuth2 авторизації
3. Автоматично обмінює код авторизації на JWT токен
4. Створює/оновлює файл `.env` з правильною конфігурацією

### 3. Ручне налаштування

Якщо автоматична авторизація не працює, створіть `.env` файл вручну:

```env
# URL з service key
SAP_URL=https://your-account-abap-trial.eu10.abap.cloud.sap

# SAP клієнт з service key
SAP_CLIENT=100

# Тип авторизації
SAP_AUTH_TYPE=xsuaa

# JWT токен (отримайте через OAuth2 flow)
SAP_JWT_TOKEN=your_jwt_token_here

# Налаштування таймаутів
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

## 🔌 Підключення до Cline

### 1. Встановлення Cline

Встановіть розширення "Cline" в VS Code з Marketplace.

### 2. Налаштування MCP сервера

1. Відкрийте налаштування VS Code (Ctrl+,)
2. Знайдіть "Cline MCP Settings"
3. Натисніть "Edit in settings.json"
4. Додайте конфігурацію сервера:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Важливо:** Замініть `C:/PATH_TO/mcp-abap-adt/` на повний шлях до вашої директорії проекту.

### 3. Перезапуск VS Code

Перезапустіть VS Code для застосування налаштувань.

## 🎯 Підключення до Cursor

### 1. Встановлення Cursor

Завантажте та встановіть Cursor з [cursor.sh](https://cursor.sh/).

### 2. Налаштування MCP

1. Відкрийте Cursor
2. Перейдіть до Settings → Features → Model Context Protocol
3. Додайте новий сервер:

```json
{
  "mcp-abap-adt": {
    "command": "node",
    "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"],
    "env": {}
  }
}
```

### 3. Активація сервера

Увімкніть сервер в налаштуваннях MCP та перезапустіть Cursor.

## 🐙 Підключення до GitHub Copilot

### 1. GitHub Copilot Extensions

GitHub Copilot підтримує MCP через розширення. Для інтеграції:

1. Встановіть GitHub Copilot Extension для VS Code
2. Налаштуйте MCP сервер через конфігурацію розширення
3. Додайте в `settings.json`:

```json
{
  "github.copilot.advanced": {
    "mcp": {
      "servers": {
        "mcp-abap-adt": {
          "command": "node",
          "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"]
        }
      }
    }
  }
}
```

### 2. Використання через Claude Desktop

Альтернативно, використовуйте Claude Desktop як проміжний інструмент:

1. Встановіть Claude Desktop
2. Налаштуйте MCP сервер в `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"]
    }
  }
}
```

## 🧪 Тестування

### 1. Тестування підключення

Запустіть сервер в режимі налагодження:
```bash
npm run dev
```

Відкрийте браузер за адресою, яку покаже команда (зазвичай `http://localhost:5173`).

### 2. Тестування інструментів

В MCP Inspector:
1. Натисніть "Connect"
2. Перейдіть до "Tools"
3. Натисніть "List Tools"
4. Спробуйте інструмент `GetProgram` з параметром `SAPMV45A`

### 3. Тестування в Cline

Запитайте Cline:
```
Отримай вихідний код програми SAPMV45A
```

Cline повинен використати MCP сервер для отримання коду.

## 🔧 Усунення проблем

### Проблеми з Node.js
- **Помилка "node не розпізнано"**: Переконайтеся, що Node.js додано до PATH
- **Помилка npm install**: Спробуйте видалити `node_modules` та запустити `npm install` знову

### Проблеми з SAP підключенням
- **Помилка авторизації**: Перевірте облікові дані в `.env` файлі
- **Таймаут**: Збільште значення таймаутів в `.env`
- **SSL помилки**: Встановіть `TLS_REJECT_UNAUTHORIZED=0` для самопідписаних сертифікатів

### Проблеми з MCP клієнтами
- **Cline не бачить сервер**: Перевірте шлях в `cline_mcp_settings.json`
- **Сервер не запускається**: Переконайтеся, що проект зібрано (`npm run build`)

### Логи та налагодження

Для детального логування встановіть змінну середовища:
```bash
set DEBUG=mcp-abap-adt:*
npm run start
```

## 📚 Доступні інструменти

| Інструмент | Опис | Параметри | Приклад використання |
|------------|------|-----------|---------------------|
| `GetProgram` | Отримання вихідного коду ABAP програми | `program_name` (string) | Отримай код програми SAPMV45A |
| `GetClass` | Отримання вихідного коду ABAP класу | `class_name` (string) | Покажи клас ZCL_MY_CLASS |
| `GetFunction` | Отримання коду функціонального модуля | `function_name`, `function_group` | Отримай функцію Z_MY_FUNCTION |
| `GetTable` | Структура таблиці БД | `table_name` (string) | Покажи структуру таблиці MARA |
| `GetTableContents` | Вміст таблиці БД | `table_name`, `max_rows` (опціонально) | Отримай дані з таблиці MARA |
| `GetEnhancements` | Аналіз enhancement'ів | `object_name`, `include_nested` (опціонально) | Знайди всі enhancement'и в SAPMV45A |
| `GetSqlQuery` | Виконання SQL запитів | `sql_query`, `row_number` (опціонально) | Виконай SELECT * FROM mara WHERE matnr LIKE 'TEST%' |
| `SearchObject` | Пошук ABAP об'єктів | `query`, `maxResults` (опціонально) | Знайди всі об'єкти що починаються з Z* |

### Приклади використання в Cline

```
# Отримання програми
Отримай вихідний код програми SAPMV45A

# Аналіз enhancement'ів
Знайди всі enhancement'и в програмі SAPMV45A включаючи вкладені include'и

# Пошук об'єктів
Знайди всі класи що починаються з ZCL_SALES

# SQL запит
Виконай SQL запит: SELECT matnr, maktx FROM mara INNER JOIN makt ON mara~matnr = makt~matnr WHERE mara~matnr LIKE 'TEST%'
```

## 🔐 Безпека

### Захист облікових даних
- Ніколи не додавайте `.env` файл до Git репозиторію
- Використовуйте JWT токени замість паролів для BTP
- Регулярно оновлюйте токени доступу

### Мережева безпека
- Використовуйте HTTPS для всіх підключень
- Налаштуйте firewall правила для обмеження доступу
- Моніторьте логи доступу

## 📞 Підтримка

При виникненні проблем:
1. Перевірте логи сервера
2. Перегляньте документацію SAP ADT
3. Створіть issue в GitHub репозиторії
4. Зверніться до SAP Basis адміністратора для питань авторизації

## 📄 Ліцензія

Цей проект розповсюджується під ліцензією MIT. Детальну інформацію дивіться у файлі LICENSE.
