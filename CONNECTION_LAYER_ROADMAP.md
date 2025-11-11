# Roadmap: Виділення ABAP Connection Layer

## Мета
Виділити всю логіку роботи з ABAP з'єднаннями в окремий пакет `@mcp-abap-adt/connection`, щоб:
- Зміни в handlers не впливали на connection layer
- Connection layer можна було використовувати незалежно від MCP сервера
- Додавати нові типи автентифікації без змін в handlers

---

## Поточна структура

### Файли, які потрібно винести:

1. **Connection інтерфейси та класи:**
   - `src/lib/connection/AbapConnection.ts` - інтерфейс `AbapConnection` та `AbapRequestOptions`
   - `src/lib/connection/BaseAbapConnection.ts` - базова реалізація з CSRF, cookies, axios
   - `src/lib/connection/OnPremAbapConnection.ts` - Basic Auth реалізація
   - `src/lib/connection/CloudAbapConnection.ts` - JWT автентифікація
   - `src/lib/connection/connectionFactory.ts` - фабрика для створення з'єднань

2. **Конфігурація:**
   - `src/lib/sapConfig.ts` - типи `SapConfig`, `SapAuthType` та функція `sapConfigSignature`

3. **Залежності:**
   - `src/lib/timeouts.ts` - функції для таймаутів (винести разом або залишити в server?)
   - `src/lib/logger.ts` - logger (створити інтерфейс `ILogger`)

### Залежності connection layer:

- `axios` - HTTP клієнт
- `@types/node` - типи Node.js
- `logger` - через інтерфейс `ILogger`
- `timeouts` - функції для таймаутів (можливо винести разом)

### Використання connection:

- `src/lib/utils.ts` - використовує `getManagedConnection()`, `createAbapConnection()`
- `src/index.ts` - використовує для створення connection
- Всі handlers - використовують через `utils.ts` функції

---

## Структура нового пакету

```
packages/connection/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                    # Експорти
    ├── types.ts                     # SapConfig, SapAuthType
    ├── connection/
    │   ├── AbapConnection.ts        # Інтерфейс AbapConnection
    │   ├── BaseAbapConnection.ts    # Базова реалізація
    │   ├── OnPremAbapConnection.ts  # Basic Auth
    │   ├── CloudAbapConnection.ts   # JWT Auth
    │   └── connectionFactory.ts     # Фабрика
    ├── config/
    │   └── sapConfig.ts             # SapConfig типи та функції
    ├── utils/
    │   └── timeouts.ts              # Функції для таймаутів (опціонально)
    └── logger.ts                    # Інтерфейс ILogger
```

---

## Детальний план реалізації

### Етап 1: Підготовка структури пакету (1-2 години)

#### 1.1 Створення директорій
```bash
mkdir -p packages/connection/src/{connection,config,utils}
```

#### 1.2 Створення `packages/connection/package.json`
```json
{
  "name": "@mcp-abap-adt/connection",
  "version": "0.1.0",
  "description": "ABAP connection layer for MCP ABAP ADT server",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest"
  },
  "dependencies": {
    "axios": "^1.11.0"
  },
  "devDependencies": {
    "@types/node": "^24.2.1",
    "typescript": "^5.9.2"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/fr0ster/mcp-abap-adt.git",
    "directory": "packages/connection"
  }
}
```

#### 1.3 Створення `packages/connection/tsconfig.json`
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Чеклист:**
- [ ] Створити структуру директорій
- [ ] Створити `package.json`
- [ ] Створити `tsconfig.json`

---

### Етап 2: Створення інтерфейсу ILogger (30 хвилин)

#### 2.1 Створити `packages/connection/src/logger.ts`

**Завдання:**
- Створити інтерфейс `ILogger` для абстракції від конкретної реалізації logger
- Connection layer не повинен залежати від конкретної реалізації logger

**Код:**
```typescript
/**
 * Logger interface for connection layer
 * Allows connection layer to be independent of specific logger implementation
 */
export interface ILogger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  
  /**
   * Log CSRF token operations
   */
  csrfToken?(action: "fetch" | "retry" | "success" | "error", message: string, meta?: any): void;
  
  /**
   * Log TLS configuration
   */
  tlsConfig?(rejectUnauthorized: boolean): void;
}
```

**Чеклист:**
- [ ] Створити файл `logger.ts`
- [ ] Визначити інтерфейс `ILogger`
- [ ] Експортувати інтерфейс

---

### Етап 3: Перенесення типів конфігурації (1 година)

#### 3.1 Створити `packages/connection/src/config/sapConfig.ts`

**Завдання:**
- Перенести `SapConfig`, `SapAuthType` типи
- Перенести функцію `sapConfigSignature`

**Код:**
```typescript
export type SapAuthType = "basic" | "jwt";

export interface SapConfig {
  url: string;
  client?: string;
  authType: SapAuthType;
  username?: string;
  password?: string;
  jwtToken?: string;
}

/**
 * Produces a stable string signature for a SAP configuration.
 * Used internally for caching connection instances when configuration changes.
 */
export function sapConfigSignature(config: SapConfig): string {
  return JSON.stringify({
    url: config.url,
    client: config.client ?? null,
    authType: config.authType,
    username: config.username ?? null,
    password: config.password ? "set" : null,
    jwtToken: config.jwtToken ? "set" : null
  });
}
```

**Чеклист:**
- [ ] Створити файл `config/sapConfig.ts`
- [ ] Перенести типи та функції
- [ ] Перевірити що все компілюється

---

### Етап 4: Перенесення timeouts (опціонально, 30 хвилин)

#### 4.1 Варіанти:

**Варіант A: Винести timeouts в connection пакет**
- Timeouts використовуються тільки в connection layer
- Логічно належать до connection

**Варіант B: Залишити timeouts в server**
- Timeouts можуть використовуватися в інших місцях
- Connection приймає timeout як параметр

**Рекомендація: Варіант A** - timeouts використовуються тільки в connection

#### 4.2 Створити `packages/connection/src/utils/timeouts.ts`

**Код:**
```typescript
export interface TimeoutConfig {
  default: number;
  csrf: number;
  long: number;
}

export function getTimeoutConfig(): TimeoutConfig {
  const defaultTimeout = parseInt(process.env.SAP_TIMEOUT_DEFAULT || "45000", 10);
  const csrfTimeout = parseInt(process.env.SAP_TIMEOUT_CSRF || "15000", 10);
  const longTimeout = parseInt(process.env.SAP_TIMEOUT_LONG || "60000", 10);

  return {
    default: defaultTimeout,
    csrf: csrfTimeout,
    long: longTimeout
  };
}

export function getTimeout(type: "default" | "csrf" | "long" | number = "default"): number {
  if (typeof type === "number") {
    return type;
  }

  const config = getTimeoutConfig();
  return config[type];
}
```

**Чеклист:**
- [ ] Вирішити чи виносити timeouts
- [ ] Створити файл `utils/timeouts.ts` (якщо виносимо)
- [ ] Перенести функції

---

### Етап 5: Перенесення connection інтерфейсів та класів (2-3 години)

#### 5.1 Створити `packages/connection/src/connection/AbapConnection.ts`

**Завдання:**
- Перенести інтерфейс `AbapConnection`
- Перенести інтерфейс `AbapRequestOptions`
- Оновити імпорти

**Код:**
```typescript
import { AxiosResponse } from "axios";
import { SapConfig } from "../config/sapConfig.js";

export interface AbapRequestOptions {
  url: string;
  method: string;
  timeout: number;
  data?: any;
  params?: any;
  headers?: Record<string, string>;
}

export interface AbapConnection {
  getConfig(): SapConfig;
  getBaseUrl(): Promise<string>;
  getAuthHeaders(): Promise<Record<string, string>>;
  makeAdtRequest(options: AbapRequestOptions): Promise<AxiosResponse>;
  reset(): void;
}
```

**Чеклист:**
- [ ] Створити файл `connection/AbapConnection.ts`
- [ ] Перенести інтерфейси
- [ ] Оновити імпорти

---

#### 5.2 Створити `packages/connection/src/connection/BaseAbapConnection.ts`

**Завдання:**
- Перенести клас `BaseAbapConnection`
- Замінити `logger` на `ILogger` інтерфейс
- Оновити імпорти для timeouts та sapConfig

**Ключові зміни:**
```typescript
import { ILogger } from "../logger.js";
import { getTimeout } from "../utils/timeouts.js"; // або з server якщо не виносимо
import { SapConfig } from "../config/sapConfig.js";
import { AbapConnection, AbapRequestOptions } from "./AbapConnection.js";

export abstract class BaseAbapConnection implements AbapConnection {
  protected constructor(
    private readonly config: SapConfig,
    private readonly logger: ILogger
  ) {}
  
  // ... решта коду
}
```

**Чеклист:**
- [ ] Створити файл `connection/BaseAbapConnection.ts`
- [ ] Перенести клас
- [ ] Замінити logger на ILogger інтерфейс
- [ ] Оновити імпорти
- [ ] Додати logger як параметр конструктора

---

#### 5.3 Створити `packages/connection/src/connection/OnPremAbapConnection.ts`

**Завдання:**
- Перенести клас `OnPremAbapConnection`
- Оновити імпорти
- Передати logger в конструктор BaseAbapConnection

**Код:**
```typescript
import { SapConfig } from "../config/sapConfig.js";
import { BaseAbapConnection } from "./BaseAbapConnection.js";
import { ILogger } from "../logger.js";

export class OnPremAbapConnection extends BaseAbapConnection {
  constructor(config: SapConfig, logger: ILogger) {
    OnPremAbapConnection.validateConfig(config);
    super(config, logger);
  }

  // ... решта коду без змін
}
```

**Чеклист:**
- [ ] Створити файл `connection/OnPremAbapConnection.ts`
- [ ] Перенести клас
- [ ] Оновити конструктор для прийняття logger
- [ ] Оновити імпорти

---

#### 5.4 Створити `packages/connection/src/connection/CloudAbapConnection.ts`

**Завдання:**
- Перенести клас `CloudAbapConnection`
- Оновити імпорти
- Передати logger в конструктор BaseAbapConnection

**Код:**
```typescript
import { SapConfig } from "../config/sapConfig.js";
import { BaseAbapConnection } from "./BaseAbapConnection.js";
import { ILogger } from "../logger.js";

export class CloudAbapConnection extends BaseAbapConnection {
  constructor(config: SapConfig, logger: ILogger) {
    CloudAbapConnection.validateConfig(config);
    super(config, logger);
  }

  // ... решта коду без змін
}
```

**Чеклист:**
- [ ] Створити файл `connection/CloudAbapConnection.ts`
- [ ] Перенести клас
- [ ] Оновити конструктор для прийняття logger
- [ ] Оновити імпорти

---

#### 5.5 Створити `packages/connection/src/connection/connectionFactory.ts`

**Завдання:**
- Перенести фабрику `createAbapConnection`
- Оновити для передачі logger

**Код:**
```typescript
import { SapConfig } from "../config/sapConfig.js";
import { AbapConnection } from "./AbapConnection.js";
import { CloudAbapConnection } from "./CloudAbapConnection.js";
import { OnPremAbapConnection } from "./OnPremAbapConnection.js";
import { ILogger } from "../logger.js";

export function createAbapConnection(config: SapConfig, logger: ILogger): AbapConnection {
  switch (config.authType) {
    case "basic":
      return new OnPremAbapConnection(config, logger);
    case "jwt":
      return new CloudAbapConnection(config, logger);
    default:
      throw new Error(`Unsupported SAP authentication type: ${config.authType}`);
  }
}
```

**Чеклист:**
- [ ] Створити файл `connection/connectionFactory.ts`
- [ ] Перенести фабрику
- [ ] Оновити для передачі logger
- [ ] Оновити імпорти

---

### Етап 6: Створення головного експорту (30 хвилин)

#### 6.1 Створити `packages/connection/src/index.ts`

**Завдання:**
- Експортувати всі публічні API
- Експортувати типи та інтерфейси

**Код:**
```typescript
// Types
export type { SapConfig, SapAuthType } from "./config/sapConfig.js";
export type { AbapRequestOptions } from "./connection/AbapConnection.js";

// Interfaces
export type { AbapConnection } from "./connection/AbapConnection.js";
export type { ILogger } from "./logger.js";

// Connection classes
export { BaseAbapConnection } from "./connection/BaseAbapConnection.js";
export { OnPremAbapConnection } from "./connection/OnPremAbapConnection.js";
export { CloudAbapConnection } from "./connection/CloudAbapConnection.js";

// Factory
export { createAbapConnection } from "./connection/connectionFactory.js";

// Config utilities
export { sapConfigSignature } from "./config/sapConfig.js";

// Timeouts (якщо винесено)
export { getTimeout, getTimeoutConfig, type TimeoutConfig } from "./utils/timeouts.js";
```

**Чеклист:**
- [ ] Створити файл `index.ts`
- [ ] Експортувати всі публічні API
- [ ] Перевірити що всі експорти коректні

---

### Етап 7: Оновлення server для використання connection layer (2-3 години)

#### 7.1 Оновити `src/lib/utils.ts`

**Завдання:**
- Оновити імпорти для використання connection з пакету
- Оновити `getManagedConnection()` для передачі logger
- Оновити `createAbapConnection()` виклики

**Зміни:**
```typescript
import { 
  AbapConnection, 
  createAbapConnection,
  SapConfig,
  sapConfigSignature,
  ILogger
} from "@mcp-abap-adt/connection";
import { logger } from "./logger";

// Оновити getManagedConnection
export function getManagedConnection(): AbapConnection {
  if (overrideConnection) {
    return overrideConnection;
  }

  const config = overrideConfig ?? getConfig();
  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    disposeConnection(cachedConnection);
    cachedConnection = createAbapConnection(config, logger as ILogger);
    cachedConfigSignature = signature;
  }

  return cachedConnection;
}

// Оновити setConfigOverride
export function setConfigOverride(override?: SapConfig) {
  overrideConfig = override;
  disposeConnection(overrideConnection);
  overrideConnection = override ? createAbapConnection(override, logger as ILogger) : undefined;
  // ...
}
```

**Чеклист:**
- [ ] Оновити імпорти в `utils.ts`
- [ ] Оновити `getManagedConnection()` для передачі logger
- [ ] Оновити `setConfigOverride()` для передачі logger
- [ ] Перевірити що все працює

---

#### 7.2 Оновити `src/index.ts`

**Завдання:**
- Оновити імпорти для використання connection з пакету
- Оновити `setAbapConnectionOverride()` якщо потрібно

**Зміни:**
```typescript
import { AbapConnection } from "@mcp-abap-adt/connection";
import { SapConfig } from "@mcp-abap-adt/connection";
```

**Чеклист:**
- [ ] Оновити імпорти в `index.ts`
- [ ] Перевірити що все працює

---

#### 7.3 Оновити `src/index.test.ts`

**Завдання:**
- Оновити імпорти для тестів

**Чеклист:**
- [ ] Оновити імпорти в тестах
- [ ] Перевірити що тести проходять

---

### Етап 8: Налаштування monorepo (1-2 години)

#### 8.1 Оновити root `package.json`

**Додати workspace:**
```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

#### 8.2 Створити `pnpm-workspace.yaml` (якщо використовуємо pnpm)

```yaml
packages:
  - 'packages/*'
```

#### 8.3 Оновити `tsconfig.json` для project references

```json
{
  "compilerOptions": {
    // ...
  },
  "references": [
    { "path": "./packages/connection" }
  ]
}
```

#### 8.4 Оновити `src/index.ts` package.json для залежності

```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "workspace:*"
  }
}
```

**Чеклист:**
- [ ] Налаштувати monorepo tool
- [ ] Створити workspace конфігурацію
- [ ] Налаштувати TypeScript project references
- [ ] Додати залежність в server package.json

---

### Етап 9: Видалення старих файлів (30 хвилин)

#### 9.1 Видалити старі файли з `src/lib/`

**Файли для видалення:**
- `src/lib/connection/*` (всі файли)
- `src/lib/sapConfig.ts`
- `src/lib/timeouts.ts` (якщо винесено)

**Чеклист:**
- [ ] Видалити старі файли
- [ ] Перевірити що немає регресій
- [ ] Оновити всі імпорти

---

### Етап 10: Тестування (2-3 години)

#### 10.1 Unit тести для connection layer

**Створити тести:**
- `packages/connection/src/connection/BaseAbapConnection.test.ts`
- `packages/connection/src/connection/OnPremAbapConnection.test.ts`
- `packages/connection/src/connection/CloudAbapConnection.test.ts`
- `packages/connection/src/connection/connectionFactory.test.ts`

#### 10.2 Integration тести

**Перевірити:**
- [ ] Connection layer працює незалежно
- [ ] Server коректно використовує connection layer
- [ ] Handlers працюють з новим connection layer
- [ ] Немає регресій

#### 10.3 E2E тести

**Перевірити:**
- [ ] Запуск сервера з connection layer
- [ ] Всі існуючі тести проходять
- [ ] Немає регресій

**Чеклист:**
- [ ] Написати unit тести
- [ ] Написати integration тести
- [ ] Запустити всі існуючі тести
- [ ] Перевірити що немає регресій

---

### Етап 11: Документація (1 година)

#### 11.1 Створити `packages/connection/README.md`

**Включити:**
- Опис пакету
- Приклади використання
- API документацію
- Приклади конфігурації

#### 11.2 Оновити основний README

**Додати інформацію про:**
- Структуру monorepo
- Як використовувати connection layer окремо

**Чеклист:**
- [ ] Створити README для connection пакету
- [ ] Оновити основний README
- [ ] Додати приклади використання

---

## Оцінка часу

| Етап | Час | Пріоритет |
|------|-----|-----------|
| 1. Підготовка структури | 1-2 год | Високий |
| 2. Інтерфейс ILogger | 30 хв | Високий |
| 3. Типи конфігурації | 1 год | Високий |
| 4. Timeouts | 30 хв | Середній |
| 5. Connection класи | 2-3 год | Високий |
| 6. Головний експорт | 30 хв | Середній |
| 7. Оновлення server | 2-3 год | Високий |
| 8. Налаштування monorepo | 1-2 год | Високий |
| 9. Видалення старих файлів | 30 хв | Високий |
| 10. Тестування | 2-3 год | Високий |
| 11. Документація | 1 год | Середній |

**Загальний час: 11-16 годин (1.5-2 робочі дні)**

---

## Ризики та виклики

### 1. Залежність від logger
**Проблема:** Connection layer потребує logger, але не повинен залежати від server
**Рішення:** Створити `ILogger` інтерфейс, передавати logger як залежність

### 2. Залежність від timeouts
**Проблема:** Timeouts використовуються в connection, але можуть використовуватися в інших місцях
**Рішення:** Винести timeouts в connection пакет (використовуються тільки там)

### 3. Циклічні залежності
**Проблема:** `utils.ts` використовує connection, але connection може використовувати utils
**Рішення:** Connection не повинен залежати від utils, тільки навпаки

### 4. TypeScript project references
**Проблема:** Можливі проблеми з type resolution між пакетами
**Рішення:** Правильна налаштування tsconfig.json з references

---

## Критерії готовності

✅ **Connection layer готовий, коли:**
- [ ] Всі типи та інтерфейси створені
- [ ] Всі connection класи перенесені
- [ ] ILogger інтерфейс реалізований
- [ ] Server використовує connection layer
- [ ] Всі тести проходять
- [ ] Документація оновлена
- [ ] Немає регресій

---

## Наступні кроки після завершення

1. Виділити utils пакет
2. Рефакторинг server для використання всіх пакетів

