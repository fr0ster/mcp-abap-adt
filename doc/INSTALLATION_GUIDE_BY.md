# Інструкцыя па ўстаноўцы MCP ABAP ADT Server

Гэты дапаможнік дапаможа вам усталяваць і наладзіць MCP ABAP ADT Server для працы з SAP ABAP сістэмамі праз Model Context Protocol (MCP). Сервер дазваляе інтэграваць ABAP распрацоўку з AI-інструментамі як Cline, Cursor і GitHub Copilot.

## 📋 Змест

1. [Перадумовы](#перадумовы)
2. [Устаноўка](#устаноўка)
3. [Наладка для On-Premise SAP](#наладка-для-on-premise-sap)
4. [Наладка для SAP BTP Cloud](#наладка-для-sap-btp-cloud)
5. [Падключэнне да Cline](#падключэнне-да-cline)
6. [Падключэнне да Cursor](#падключэнне-да-cursor)
7. [Падключэнне да GitHub Copilot](#падключэнне-да-github-copilot)
8. [Тэсціраванне](#тэсціраванне)
9. [Вырашэнне праблем](#вырашэнне-праблем)
10. [Даступныя інструменты](#даступныя-інструменты)

## 🔧 Перадумовы

### Сістэмныя патрабаванні
- **Node.js** версіі 18 або навейшай
- **npm** (усталёўваецца разам з Node.js)
- **Git** для кланавання рэпазіторыя
- Доступ да SAP ABAP сістэмы (on-premise або BTP)

### SAP сістэмныя патрабаванні
- Актываваныя ADT сэрвісы ў транзакцыі `SICF`:
  - `/sap/bc/adt`
- Для інструмента `GetTableContents` патрэбна рэалізацыя кастомнага сэрвісу `/z_mcp_abap_adt/z_tablecontent`
- Адпаведныя аўтарызацыі для карыстальніка SAP

### Устаноўка Node.js
1. Спампуйце Node.js LTS версію з [nodejs.org](https://nodejs.org/)
2. Усталюйце, следуючы інструкцыям для вашай АС
3. Праверце ўстаноўку:
   ```bash
   node -v
   npm -v
   ```

## 📦 Устаноўка

### Аўтаматычная ўстаноўка праз Smithery

```bash
npx -y @smithery/cli install @mario-andreschak/mcp-abap-adt --client cline
```

### Ручная ўстаноўка

1. **Кланаванне рэпазіторыя:**
   ```bash
   git clone https://github.com/mario-andreschak/mcp-abap-adt.git
   cd mcp-abap-adt
   ```

2. **Устаноўка залежнасцей:**
   ```bash
   npm install
   ```

3. **Зборка праекта:**
   ```bash
   npm run build
   ```

## 🏢 Наладка для On-Premise SAP

### 1. Стварэнне файла канфігурацыі

Стварыце файл `.env` у каранёвай дырэкторыі праекта:

```env
# URL вашай SAP сістэмы
SAP_URL=https://your-sap-system.com:8000

# SAP кліент
SAP_CLIENT=100

# Мова (апцыянальна, па змаўчанні 'en')
SAP_LANGUAGE=en

# Тып аўтарызацыі
SAP_AUTH_TYPE=basic

# Уліковыя дадзеныя
SAP_USERNAME=your_username
SAP_PASSWORD=your_password

# TLS налады (усталюйце 0 для самападпісаных сертыфікатаў)
TLS_REJECT_UNAUTHORIZED=0

# Налады таймаўтаў (у мілісекундах)
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

### 2. Праверка падключэння

Запусціце тэставае падключэнне:
```bash
npm run start
```

## ☁️ Наладка для SAP BTP Cloud

### 1. Атрыманне Service Key

1. Увайдзіце ў SAP BTP Cockpit
2. Перайдзіце да вашага ABAP Environment
3. Стварыце Service Key для Communication Arrangement
4. Спампуйце JSON файл з ключом

### 2. Аўтаматычная аўтарызацыя (рэкамендавана)

Выкарыстоўвайце ўбудаваны інструмент для аўтаматычнага атрымання JWT токена:

```bash
node tools/sap-abap-auth-browser.js auth --key path/to/your/service-key.json --browser chrome
```

**Параметры:**
- `--key <path>`: Шлях да JSON файла з service key
- `--browser <browser>`: Браўзер для адкрыцця (chrome, edge, firefox, system, none)

**Што робіць інструмент:**
1. Чытае ваш SAP BTP service key
2. Адкрывае браўзер для OAuth2 аўтарызацыі
3. Аўтаматычна абменьвае код аўтарызацыі на JWT токен
4. Стварае/абнаўляе файл `.env` з правільнай канфігурацыяй

### 3. Ручная наладка

Калі аўтаматычная аўтарызацыя не працуе, стварыце файл `.env` уручную:

```env
# URL з service key
SAP_URL=https://your-account-abap-trial.eu10.abap.cloud.sap

# SAP кліент з service key
SAP_CLIENT=100

# Тып аўтарызацыі
SAP_AUTH_TYPE=xsuaa

# JWT токен (атрымайце праз OAuth2 flow)
SAP_JWT_TOKEN=your_jwt_token_here

# Налады таймаўтаў
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

## 🔌 Падключэнне да Cline

### 1. Устаноўка Cline

Усталюйце пашырэнне "Cline" у VS Code з Marketplace.

### 2. Наладка MCP сервера

1. Адкрыйце налады VS Code (Ctrl+,)
2. Знайдзіце "Cline MCP Settings"
3. Націсніце "Edit in settings.json"
4. Дадайце канфігурацыю сервера:

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

**Важна:** Замяніце `C:/PATH_TO/mcp-abap-adt/` на поўны шлях да вашай дырэкторыі праекта.

### 3. Перазапуск VS Code

Перазапусціце VS Code для прымянення налад.

## 🎯 Падключэнне да Cursor

### 1. Устаноўка Cursor

Спампуйце і ўсталюйце Cursor з [cursor.sh](https://cursor.sh/).

### 2. Наладка MCP

1. Адкрыйце Cursor
2. Перайдзіце да Settings → Features → Model Context Protocol
3. Дадайце новы сервер:

```json
{
  "mcp-abap-adt": {
    "command": "node",
    "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"],
    "env": {}
  }
}
```

### 3. Актывацыя сервера

Уключыце сервер у наладах MCP і перазапусціце Cursor.

## 🐙 Падключэнне да GitHub Copilot

### 1. GitHub Copilot Extensions

GitHub Copilot падтрымлівае MCP праз пашырэнні. Для інтэграцыі:

1. Усталюйце GitHub Copilot Extension для VS Code
2. Наладзьце MCP сервер праз канфігурацыю пашырэння
3. Дадайце ў `settings.json`:

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

### 2. Выкарыстанне праз Claude Desktop

Альтэрнатыўна, выкарыстоўвайце Claude Desktop як прамежкавы інструмент:

1. Усталюйце Claude Desktop
2. Наладзьце MCP сервер у `claude_desktop_config.json`:

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

## 🧪 Тэсціраванне

### 1. Тэсціраванне падключэння

Запусціце сервер у рэжыме адладкі:
```bash
npm run dev
```

Адкрыйце браўзер па адрасе, якую пакажа каманда (звычайна `http://localhost:5173`).

### 2. Тэсціраванне інструментаў

У MCP Inspector:
1. Націсніце "Connect"
2. Перайдзіце да "Tools"
3. Націсніце "List Tools"
4. Паспрабуйце інструмент `GetProgram` з параметрам `SAPMV45A`

### 3. Тэсціраванне ў Cline

Спытайце Cline:
```
Атрымай зыходны код праграмы SAPMV45A
```

Cline павінен выкарыстаць MCP сервер для атрымання кода.

## 🔧 Вырашэнне праблем

### Праблемы з Node.js
- **Памылка "node не распазнаны"**: Пераканайцеся, што Node.js дададзены ў PATH
- **Памылка npm install**: Паспрабуйце выдаліць `node_modules` і запусціць `npm install` зноў

### Праблемы з SAP падключэннем
- **Памылка аўтарызацыі**: Праверце ўліковыя дадзеныя ў файле `.env`
- **Таймаўт**: Павялічце значэнні таймаўтаў у `.env`
- **SSL памылкі**: Усталюйце `TLS_REJECT_UNAUTHORIZED=0` для самападпісаных сертыфікатаў

### Праблемы з MCP кліентамі
- **Cline не бачыць сервер**: Праверце шлях у `cline_mcp_settings.json`
- **Сервер не запускаецца**: Пераканайцеся, што праект сабраны (`npm run build`)

### Логі і адладка

Для дэтальнага логавання ўсталюйце зменную асяроддзя:
```bash
set DEBUG=mcp-abap-adt:*
npm run start
```

## 📚 Даступныя інструменты

| Інструмент | Апісанне | Параметры | Прыклад выкарыстання |
|------------|----------|-----------|---------------------|
| `GetProgram` | Атрыманне зыходнага кода ABAP праграмы | `program_name` (string) | Атрымай код праграмы SAPMV45A |
| `GetClass` | Атрыманне зыходнага кода ABAP класа | `class_name` (string) | Пакажы клас ZCL_MY_CLASS |
| `GetFunction` | Атрыманне кода функцыянальнага модуля | `function_name`, `function_group` | Атрымай функцыю Z_MY_FUNCTION |
| `GetTable` | Структура табліцы БД | `table_name` (string) | Пакажы структуру табліцы MARA |
| `GetTableContents` | Змест табліцы БД | `table_name`, `max_rows` (апцыянальна) | Атрымай дадзеныя з табліцы MARA |
| `GetEnhancements` | Аналіз enhancement'аў | `object_name`, `include_nested` (апцыянальна) | Знайдзі ўсе enhancement'ы ў SAPMV45A |
| `GetSqlQuery` | Выкананне SQL запытаў | `sql_query`, `row_number` (апцыянальна) | Выканай SELECT * FROM mara WHERE matnr LIKE 'TEST%' |
| `SearchObject` | Пошук ABAP аб'ектаў | `query`, `maxResults` (апцыянальна) | Знайдзі ўсе аб'екты што пачынаюцца з Z* |

### Прыклады выкарыстання ў Cline

```
# Атрыманне праграмы
Атрымай зыходны код праграмы SAPMV45A

# Аналіз enhancement'аў
Знайдзі ўсе enhancement'ы ў праграме SAPMV45A уключаючы ўкладзеныя include'ы

# Пошук аб'ектаў
Знайдзі ўсе класы што пачынаюцца з ZCL_SALES

# SQL запыт
Выканай SQL запыт: SELECT matnr, maktx FROM mara INNER JOIN makt ON mara~matnr = makt~matnr WHERE mara~matnr LIKE 'TEST%'
```

## 🔐 Бяспека

### Абарона ўліковых дадзеных
- Ніколі не дадавайце файл `.env` у Git рэпазіторый
- Выкарыстоўвайце JWT токены замест пароляў для BTP
- Рэгулярна абнаўляйце токены доступу

### Сеткавая бяспека
- Выкарыстоўвайце HTTPS для ўсіх падключэнняў
- Наладзьце правілы firewall для абмежавання доступу
- Маніторце логі доступу

## 📞 Падтрымка

Пры ўзнікненні праблем:
1. Праверце логі сервера
2. Прагледзьце дакументацыю SAP ADT
3. Стварыце issue ў GitHub рэпазіторыі
4. Звярніцеся да SAP Basis адміністратара па пытаннях аўтарызацыі

## 📄 Ліцэнзія

Гэты праект распаўсюджваецца пад ліцэнзіяй MIT. Дэтальную інфармацыю глядзіце ў файле LICENSE.
