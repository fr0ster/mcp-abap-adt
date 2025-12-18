# Уніфікована логіка створення AuthBroker

## Принципи

1. **Один брокер на один destination** – мапа брокерів за ключем `destination` (або `'default'` для дефолтного).
2. **Дефолтний брокер** – спеціальний брокер з ключем `'default'`, який використовується коли destination не вказано в headers.
3. **Токен витягується тільки в MCP‑хендлері** – брокер не викликається у транспорту/серверу до моменту виконання інструмента. MCP‑сервер має лиш передати в хендлер destination/ідентифікатор і доступ до брокера, але не тягнути токен наперед.

## Створення дефолтного брокера (по транспортам)

### Streamable HTTP
- Стартуємо без обов’язкового дефолтного брокера.
- Якщо `--mcp=destination` → створюємо брокер з ключем `'default'` (або destination), з serviceKeyStore + sessionStore (safe/file залежно від `--unsafe`), tokenProvider = `BtpTokenProvider`.
- Якщо `--env=path/to/.env` → створюємо брокер `'default'` без serviceKeyStore, sessionStore з тієї ж директорії, tokenProvider = `BtpTokenProvider`.
- Якщо немає жодного з вище, брокер не створюється: конект можливий тільки по headers або через destination у запиті (брокер тоді створюється на льоту).

### SSE
- Аналогічно HTTP, але дефолтний брокер доречний для локальних сценаріїв:
  - `--mcp=destination` → брокер `'default'` з serviceKeyStore + sessionStore.
  - `.env` у поточній директорії без `--auth-broker` → брокер `'default'` без serviceKeyStore, sessionStore з поточної директорії.
  - `--env=path/to/.env` → брокер `'default'` без serviceKeyStore, sessionStore з директорії .env.
  - Якщо нічого з цього немає, брокер не створюється; з’єднання можливе лише якщо клієнт надасть destination/headers, і тоді брокер може бути створений на льоту для цього destination.

### stdio
- Вимагає дефолтний брокер на старті, інакше помилка.
- Варіанти:
  - `--mcp=destination` → брокер `'default'` з serviceKeyStore + sessionStore.
  - `.env` у поточній директорії без `--auth-broker` → брокер `'default'` без serviceKeyStore, sessionStore з поточної директорії.
  - `--env=path/to/.env` → брокер `'default'` без serviceKeyStore, sessionStore з директорії .env.
- Інші випадки: брокер не створюється → сервер не стартує (stdio без дефолтного джерела недопустимий).

## Використання брокерів (по транспортам)

### Streamable HTTP
- **Ключ у мапі**: `destination` (+ стабільний клієнтський ідентифікатор, якщо треба ізолювати клієнтів; варіантами можуть бути `sessionId` або `clientId:port`).
- **Поведінка**:
  1. У PUT/POST обробнику (до створення MCP server) читаємо destination з headers.
  2. Якщо destination є: шукаємо брокер у мапі, за відсутності створюємо, кладемо в мапу; якщо створення не вдалося – повертаємо помилку.
  3. Якщо destination немає: беремо дефолтний брокер; якщо його немає – читаємо прямі параметри конекту з headers; якщо і їх немає – повертаємо помилку.
  4. Далі створюємо MCP server instance для запиту/клієнта, передаємо в хендлери destination/брокер (або параметри headers). **Токен витягується лише в хендлері перед виконанням інструмента.**

### SSE
- **Ключ у мапі**: аналогічно Streamable HTTP (destination + за потреби клієнтський ідентифікатор).
- **Поведінка**:
  1. У GET обробнику (до створення MCP server для сесії) читаємо destination з headers.
  2. Якщо destination є: беремо/створюємо брокер, кладемо в мапу; якщо не вдалося – повертаємо помилку.
  3. Якщо destination немає: пробуємо дефолтний брокер; якщо його немає – читаємо прямі headers; якщо нічого немає – повертаємо помилку.
  4. Створюємо MCP server для сесії, передаємо в хендлери destination/брокер (або параметри headers). **Токен витягується лише в хендлері.**

### stdio
- **Ключ у мапі**: єдиний брокер на старті (`default` або destination з `--mcp`).
- **Поведінка**:
  1. При старті створюємо брокер за `--mcp` / конфігом / ENV. Якщо нічого немає – помилка і не стартуємо.
  2. Створюємо MCP server один раз на старті.
  3. Хендлери отримують destination/брокер і тягнуть токен тільки під час виконання інструмента.

## Структура мапи брокерів

```typescript
Map<string, AuthBroker> {
  'default' => AuthBroker {  // Дефолтний брокер (якщо створено)
    serviceKeyStore?: IServiceKeyStore,  // Може бути undefined для --env випадку
    sessionStore: ISessionStore,
    tokenProvider: BtpTokenProvider
  },
  'trial' => AuthBroker {  // Брокер для конкретного destination
    serviceKeyStore: IServiceKeyStore,
    sessionStore: ISessionStore,  // Спільний з іншими destinations
    tokenProvider: BtpTokenProvider
  },
  'production' => AuthBroker {  // Інший destination
    serviceKeyStore: IServiceKeyStore,
    sessionStore: ISessionStore,  // Той самий instance що і для 'trial'
    tokenProvider: BtpTokenProvider
  }
}
```

## Спільні stores

- **ServiceKeyStore**: Окремий для кожного destination (бо кожен destination має свій файл service key)
- **SessionStore**: Спільний для всіх destinations з тим самим каталогом та типом
  - Ключ для спільного store: `${storeType}::${sessionsDir}::${unsafe}`
  - Кожен destination має свій файл сесії всередині каталогу: `{destination}.env`

## Алгоритм роботи

### Ініціалізація (при старті сервера):

```
1. Перевірити параметри командного рядка:
   - Якщо --mcp=destination → створити дефолтний брокер з serviceKeyStore для destination
   - Якщо --env=path → створити дефолтний брокер з sessionStore з path (без serviceKeyStore)
   - Якщо stdio/sse + .env в поточному фолдері + НЕ --auth-broker → створити дефолтний брокер з sessionStore (без serviceKeyStore)

2. Для stdio:
   - Якщо дефолтний брокер НЕ створено → помилка, не стартувати
   - Якщо дефолтний брокер створено → використовувати його для підключення

3. Для SSE/HTTP:
   - Сервер стартує в будь-якому випадку
   - Дефолтний брокер використовується тільки якщо destination не вказано в headers
```

### Обробка запиту (для SSE/HTTP):

```
1. Отримати destination з headers (x-mcp-destination або X-MCP-Destination).
2. Якщо destination вказано:
   a. Взяти брокер з мапи (destination [+ clientId/sessionId], якщо використовується).
   b. Якщо не знайдено – створити, покласти в мапу; якщо не вдалось – повернути помилку.
3. Якщо destination НЕ вказано:
   a. Спробувати дефолтний брокер.
   b. Якщо дефолтного немає – читати прямі headers; якщо і їх немає – повернути помилку.
4. Створити MCP server для запиту/сесії, передати в хендлери destination/брокер.
5. Хендлер перед виконанням інструмента викликає broker.getToken(destination) і створює конекшн.
```

## Приклади

### Приклад 1: stdio з --mcp=trial
```bash
npm run dev -- --mcp=trial
```
- Створюється дефолтний брокер з serviceKeyStore для 'trial'
- Підключення через дефолтний брокер

### Приклад 2: stdio з --env=./.env.local
```bash
npm run dev -- --env=./.env.local
```
- Створюється дефолтний брокер з sessionStore з ./.env.local (без serviceKeyStore)
- Підключення через дефолтний брокер

### Приклад 3: HTTP з --mcp=trial, кліент НЕ передає destination в headers
```bash
npm run dev:http -- --mcp=trial
# Кліент робить запит БЕЗ x-mcp-destination header
```
- Створюється дефолтний брокер з serviceKeyStore для 'trial'
- Використовується дефолтний брокер

### Приклад 4: HTTP з --mcp=trial, кліент передає destination=production в headers
```bash
npm run dev:http -- --mcp=trial
# Кліент робить запит з x-mcp-destination: production
```
- Створюється дефолтний брокер з serviceKeyStore для 'trial'
- Створюється окремий брокер для 'production'
- Використовується брокер для 'production'

### Приклад 5: HTTP БЕЗ --mcp та БЕЗ .env, кліент передає всі headers
```bash
npm run dev:http
# Кліент робить запит з SAP_URL, SAP_JWT_TOKEN, тощо
```
- Дефолтний брокер НЕ створюється
- Підключення тільки по headers (без брокера)

### Приклад 6: stdio БЕЗ параметрів та БЕЗ .env
```bash
npm run dev
```
- Дефолтний брокер НЕ створюється
- ❌ Помилка: "stdio transport requires either --mcp parameter or .env file"
- Сервер не стартує
