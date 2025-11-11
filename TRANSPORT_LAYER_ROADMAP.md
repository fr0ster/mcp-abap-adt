# Roadmap: Виділення Transport Layer

## Мета
Виділити всю логіку роботи з транспортами (STDIO, SSE, StreamableHTTP) в окремий пакет `@mcp-abap-adt/transport`, щоб:
- Зміни в handlers не впливали на transport layer
- Transport layer можна було використовувати незалежно
- Додавати нові протоколи без змін в server core

---

## Як використовувати цей roadmap

### Підхід до роботи

1. **Послідовне виконання етапів**
   - Виконуйте етапи по порядку (1 → 2 → 3...)
   - Кожен етап залежить від попередніх
   - Не пропускайте етапи

2. **Відмічайте виконані завдання**
   - Використовуйте чеклисти `[ ]` → `[x]` в документі
   - Або створіть окремий файл для відстеження прогресу

3. **Тестуйте після кожного етапу**
   - Перевіряйте що код компілюється
   - Запускайте базові тести
   - Не переходьте до наступного етапу, поки поточний не працює

4. **Комітьте часто**
   - Після кожного завершеного етапу
   - Змістовні commit messages: `feat(transport): add TransportConfig types`
   - Використовуйте feature branch

### Приклад роботи

```bash
# 1. Створіть feature branch
git checkout -b refactor/transport-layer

# 2. Виконайте Етап 1 (Підготовка структури)
mkdir -p packages/transport/src/{config,transports,server}
# ... створіть файли згідно з roadmap
git add packages/transport/
git commit -m "feat(transport): setup package structure"

# 3. Виконайте Етап 2 (Типи та інтерфейси)
# ... створіть types.ts
git add packages/transport/src/types.ts
git commit -m "feat(transport): add TransportConfig types and interfaces"

# 4. Продовжуйте по етапах...
```

### Відстеження прогресу

**Варіант 1: Відмічати в roadmap**
```markdown
- [x] Створити файл `types.ts` ✅
- [ ] Перенести `TransportConfig` type
- [ ] Створити `TransportInterface` інтерфейс
```

**Варіант 2: Окремий файл прогресу**
Створіть `TRANSPORT_LAYER_PROGRESS.md`:
```markdown
# Progress: Transport Layer Refactoring

## Етап 1: Підготовка структури ✅
- [x] Створено директорії
- [x] Створено package.json
- [x] Створено tsconfig.json

## Етап 2: Типи та інтерфейси 🔄
- [x] Створено types.ts
- [ ] Перенесено TransportConfig
- [ ] Створено TransportInterface
```

### Якщо щось не працює

1. **Перевірте залежності**
   - Чи правильно налаштований monorepo?
   - Чи правильно налаштовані TypeScript references?

2. **Поверніться до попереднього етапу**
   - Перевірте що попередній етап завершено
   - Перевірте що всі чеклисти відмічені

3. **Перевірте приклади коду**
   - В roadmap є приклади для кожного етапу
   - Адаптуйте їх під ваш код

4. **Запитайте допомоги**
   - Створіть issue з описом проблеми
   - Додайте код який не працює

### Очікуваний результат

Після завершення всіх етапів:
- ✅ Transport layer виділено в окремий пакет
- ✅ Server використовує transport через інтерфейс
- ✅ Всі тести проходять
- ✅ Немає регресій
- ✅ Код готовий до merge в main

---

## Поточна структура

### Файли, які потрібно винести з `src/index.ts`:

1. **Типи та інтерфейси:**
   - `TransportConfig` (рядки 178-196)
   - `ServerOptions.transportConfig` (рядок 346)

2. **Функції парсингу конфігурації:**
   - `getArgValue()` (рядки 198-210)
   - `hasFlag()` (рядки 212-214)
   - `parseBoolean()` (рядки 216-222)
   - `resolvePortOption()` (рядки 224-236)
   - `resolveBooleanOption()` (рядки 238-251)
   - `resolveListOption()` (рядки 253-263)
   - `parseTransportConfig()` (рядки 265-339)

3. **Логіка створення транспорту в `run()`:**
   - STDIO transport (рядки 753-760)
   - StreamableHTTP transport (рядки 763-823)
   - SSE transport (рядки 826-979)

4. **Залежності:**
   - `StdioServerTransport` з `@modelcontextprotocol/sdk/server/stdio.js`
   - `StreamableHTTPServerTransport` з `@modelcontextprotocol/sdk/server/streamableHttp.js`
   - `SSEServerTransport` з `@modelcontextprotocol/sdk/server/sse.js`
   - `Server` з `@modelcontextprotocol/sdk/server/index.js`
   - `createServer` з `http`
   - `randomUUID` з `crypto`
   - `logger` з `./lib/logger`

---

## Структура нового пакету

```
packages/transport/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                    # Експорти
    ├── types.ts                     # TransportConfig, TransportInterface
    ├── config/
    │   ├── parser.ts                # parseTransportConfig та допоміжні функції
    │   └── options.ts                # Типи для опцій парсингу
    ├── transports/
    │   ├── StdioTransport.ts        # Обгортка для STDIO
    │   ├── StreamableHttpTransport.ts # Обгортка для StreamableHTTP
    │   ├── SSETransport.ts          # Обгортка для SSE
    │   └── TransportFactory.ts      # Фабрика для створення транспорту
    └── server/
        └── TransportServer.ts       # Клас для управління HTTP сервером (для SSE/HTTP)
```

---

## Детальний план реалізації

### Етап 1: Підготовка структури пакету (1-2 години)

#### 1.1 Створення директорій
```bash
mkdir -p packages/transport/src/{config,transports,server}
```

#### 1.2 Створення `packages/transport/package.json`
```json
{
  "name": "@mcp-abap-adt/transport",
  "version": "0.1.0",
  "description": "Transport layer for MCP ABAP ADT server",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.2"
  },
  "devDependencies": {
    "@types/node": "^24.2.1",
    "typescript": "^5.9.2"
  }
}
```

#### 1.3 Створення `packages/transport/tsconfig.json`
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

---

### Етап 2: Створення типів та інтерфейсів (1-2 години)

#### 2.1 Створити `packages/transport/src/types.ts`

**Завдання:**
- Перенести `TransportConfig` type
- Створити `TransportInterface` інтерфейс
- Створити типи для опцій кожного транспорту

**Код:**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Server as HttpServer } from "http";

export type TransportConfig =
  | { type: "stdio" }
  | {
      type: "streamable-http";
      host: string;
      port: number;
      enableJsonResponse: boolean;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    }
  | {
      type: "sse";
      host: string;
      port: number;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    };

export interface TransportInterface {
  connect(server: Server): Promise<void>;
  close(): Promise<void>;
  getType(): "stdio" | "streamable-http" | "sse";
}

export interface TransportResult {
  transport: TransportInterface;
  httpServer?: HttpServer;
  cleanup?: () => Promise<void>;
}
```

**Чеклист:**
- [ ] Створити файл `types.ts`
- [ ] Перенести `TransportConfig` type
- [ ] Створити `TransportInterface` інтерфейс
- [ ] Створити `TransportResult` interface
- [ ] Експортувати всі типи

---

### Етап 3: Створення парсера конфігурації (2-3 години)

#### 3.1 Створити `packages/transport/src/config/parser.ts`

**Завдання:**
- Перенести всі функції парсингу з `src/index.ts`
- Зробити функції незалежними від глобальних змінних
- Додати JSDoc коментарі

**Функції для перенесення:**
1. `getArgValue(name: string): string | undefined`
2. `hasFlag(name: string): boolean`
3. `parseBoolean(value?: string): boolean`
4. `resolvePortOption(argName, envName, defaultValue): number`
5. `resolveBooleanOption(argName, envName, defaultValue): boolean`
6. `resolveListOption(argName, envName): string[] | undefined`
7. `parseTransportConfig(): TransportConfig`

**Код структура:**
```typescript
/**
 * Parses command line arguments and environment variables to create TransportConfig
 */
export function parseTransportConfig(
  argv?: string[],
  env?: NodeJS.ProcessEnv
): TransportConfig {
  // Implementation
}

// Helper functions
export function getArgValue(name: string, argv?: string[]): string | undefined
export function hasFlag(name: string, argv?: string[]): boolean
export function parseBoolean(value?: string): boolean
export function resolvePortOption(...): number
export function resolveBooleanOption(...): boolean
export function resolveListOption(...): string[] | undefined
```

**Чеклист:**
- [ ] Створити файл `config/parser.ts`
- [ ] Перенести всі функції парсингу
- [ ] Зробити функції приймати argv та env як параметри (для тестування)
- [ ] Додати JSDoc коментарі
- [ ] Написати unit тести для парсера

---

### Етап 4: Створення обгорток для транспорту (3-4 години)

#### 4.1 Створити `packages/transport/src/transports/StdioTransport.ts`

**Завдання:**
- Створити обгортку навколо `StdioServerTransport`
- Реалізувати `TransportInterface`

**Код:**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TransportInterface } from "../types.js";

export class StdioTransport implements TransportInterface {
  private transport: StdioServerTransport;

  constructor() {
    this.transport = new StdioServerTransport();
  }

  async connect(server: Server): Promise<void> {
    await server.connect(this.transport);
  }

  async close(): Promise<void> {
    // Stdio transport doesn't need explicit close
  }

  getType(): "stdio" {
    return "stdio";
  }
}
```

**Чеклист:**
- [ ] Створити файл `transports/StdioTransport.ts`
- [ ] Реалізувати `TransportInterface`
- [ ] Написати unit тести

---

#### 4.2 Створити `packages/transport/src/transports/StreamableHttpTransport.ts`

**Завдання:**
- Створити обгортку навколо `StreamableHTTPServerTransport`
- Управління HTTP сервером
- Обробка помилок

**Код:**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { TransportInterface, TransportConfig } from "../types.js";
import { Logger } from "../logger.js"; // Потрібно визначити як передавати logger

export class StreamableHttpTransport implements TransportInterface {
  private transport: StreamableHTTPServerTransport;
  private httpServer?: HttpServer;
  private config: Extract<TransportConfig, { type: "streamable-http" }>;
  private logger: Logger;

  constructor(config: Extract<TransportConfig, { type: "streamable-http" }>, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: config.enableJsonResponse,
      allowedOrigins: config.allowedOrigins,
      allowedHosts: config.allowedHosts,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    });
  }

  async connect(server: Server): Promise<void> {
    await server.connect(this.transport);

    this.httpServer = createServer(async (req, res) => {
      try {
        await this.transport.handleRequest(req, res);
      } catch (error) {
        this.logger.error("Failed to handle HTTP request", {
          type: "HTTP_REQUEST_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.writeHead(500).end("Internal Server Error");
        } else {
          res.end();
        }
      }
    });

    this.httpServer.on("clientError", (err, socket) => {
      this.logger.error("HTTP client error", {
        type: "HTTP_CLIENT_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.logger.error("HTTP server failed to start", {
          type: "HTTP_SERVER_ERROR",
          error: error.message,
        });
        this.httpServer?.off("error", onError);
        reject(error);
      };

      this.httpServer!.once("error", onError);
      this.httpServer!.listen(this.config.port, this.config.host, () => {
        this.httpServer!.off("error", onError);
        this.logger.info("HTTP server listening", {
          type: "HTTP_SERVER_LISTENING",
          host: this.config.host,
          port: this.config.port,
          enableJsonResponse: this.config.enableJsonResponse,
        });
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close((closeError) => {
          if (closeError) {
            this.logger.error("Failed to close HTTP server", {
              type: "HTTP_SERVER_SHUTDOWN_ERROR",
              error: closeError instanceof Error ? closeError.message : String(closeError),
            });
          }
          resolve();
        });
      });
      this.httpServer = undefined;
    }
  }

  getType(): "streamable-http" {
    return "streamable-http";
  }

  getHttpServer(): HttpServer | undefined {
    return this.httpServer;
  }
}
```

**Чеклист:**
- [ ] Створити файл `transports/StreamableHttpTransport.ts`
- [ ] Реалізувати `TransportInterface`
- [ ] Перенести логіку створення HTTP сервера
- [ ] Перенести обробку помилок
- [ ] Написати unit тести

---

#### 4.3 Створити `packages/transport/src/transports/SSETransport.ts`

**Завдання:**
- Створити обгортку навколо `SSEServerTransport`
- Управління HTTP сервером для SSE
- Обробка GET/POST запитів
- Управління станом SSE сесії

**Код структура:**
```typescript
export class SSETransport implements TransportInterface {
  private transport?: SSEServerTransport;
  private httpServer?: HttpServer;
  private config: Extract<TransportConfig, { type: "sse" }>;
  private logger: Logger;
  private streamPathMap: Map<string, string>;
  private postPathSet: Set<string>;

  constructor(config: Extract<TransportConfig, { type: "sse" }>, logger: Logger) {
    // Implementation
  }

  async connect(server: Server): Promise<void> {
    // Implementation with HTTP server setup
  }

  async close(): Promise<void> {
    // Implementation
  }

  getType(): "sse" {
    return "sse";
  }

  getHttpServer(): HttpServer | undefined {
    return this.httpServer;
  }
}
```

**Чеклист:**
- [ ] Створити файл `transports/SSETransport.ts`
- [ ] Перенести всю логіку SSE з `run()` методу
- [ ] Перенести логіку обробки GET/POST запитів
- [ ] Перенести streamPathMap та postPathSet
- [ ] Перенести обробку помилок
- [ ] Написати unit тести

---

### Етап 5: Створення фабрики транспорту (1-2 години)

#### 5.1 Створити `packages/transport/src/transports/TransportFactory.ts`

**Завдання:**
- Створити фабрику для створення транспорту на основі конфігурації
- Інтегрувати з logger (як передавати logger?)

**Код:**
```typescript
import { TransportConfig, TransportInterface } from "../types.js";
import { StdioTransport } from "./StdioTransport.js";
import { StreamableHttpTransport } from "./StreamableHttpTransport.js";
import { SSETransport } from "./SSETransport.js";
import { Logger } from "../logger.js"; // Потрібно визначити

export class TransportFactory {
  static create(config: TransportConfig, logger: Logger): TransportInterface {
    switch (config.type) {
      case "stdio":
        return new StdioTransport();
      case "streamable-http":
        return new StreamableHttpTransport(config, logger);
      case "sse":
        return new SSETransport(config, logger);
      default:
        throw new Error(`Unsupported transport type: ${(config as any).type}`);
    }
  }
}
```

**Чеклист:**
- [ ] Створити файл `transports/TransportFactory.ts`
- [ ] Реалізувати фабрику
- [ ] Написати unit тести

---

### Етап 6: Вирішення залежності від logger (1 година)

#### 6.1 Варіанти рішення:

**Варіант A: Logger як залежність (рекомендовано)**
- Створити інтерфейс `ILogger` в transport пакеті
- Server передає logger при створенні транспорту
- Transport не залежить від конкретної реалізації logger

**Варіант B: Logger як опціональний**
- Transport може працювати без logger (використовує console)
- Logger передається опціонально

**Варіант C: Винести logger в окремий пакет**
- Створити `@mcp-abap-adt/logger`
- Обидва пакети використовують його

**Рекомендація: Варіант A**

**Реалізація:**
```typescript
// packages/transport/src/logger.ts
export interface ILogger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}
```

**Чеклист:**
- [ ] Створити `ILogger` інтерфейс
- [ ] Оновити всі transport класи для використання `ILogger`
- [ ] Оновити фабрику для прийняття logger

---

### Етап 7: Створення головного експорту (30 хвилин)

#### 7.1 Створити `packages/transport/src/index.ts`

**Завдання:**
- Експортувати всі публічні API
- Експортувати типи та інтерфейси

**Код:**
```typescript
// Types
export type { TransportConfig, TransportResult } from "./types.js";
export type { ILogger } from "./logger.js";

// Interfaces
export { TransportInterface } from "./types.js";

// Config parser
export { parseTransportConfig } from "./config/parser.js";

// Transports
export { StdioTransport } from "./transports/StdioTransport.js";
export { StreamableHttpTransport } from "./transports/StreamableHttpTransport.js";
export { SSETransport } from "./transports/SSETransport.js";

// Factory
export { TransportFactory } from "./transports/TransportFactory.js";
```

**Чеклист:**
- [ ] Створити файл `index.ts`
- [ ] Експортувати всі публічні API
- [ ] Перевірити що всі експорти коректні

---

### Етап 8: Оновлення server для використання transport layer (2-3 години)

#### 8.1 Оновити `src/index.ts`

**Завдання:**
- Видалити весь transport код
- Імпортувати transport layer
- Оновити `mcp_abap_adt_server` клас

**Зміни:**

1. **Видалити:**
   - `TransportConfig` type
   - Всі функції парсингу
   - Весь код з `run()` методу для transport

2. **Додати імпорти:**
   ```typescript
   import {
     TransportConfig,
     TransportInterface,
     parseTransportConfig,
     TransportFactory,
     ILogger
   } from "@mcp-abap-adt/transport";
   ```

3. **Оновити `mcp_abap_adt_server` клас:**
   ```typescript
   export class mcp_abap_adt_server {
     private transport?: TransportInterface;
     private httpServer?: HttpServer;
     
     constructor(options?: ServerOptions) {
       // ...
       this.transportConfig = options?.transportConfig ?? parseTransportConfig();
     }
     
     async run() {
       this.transport = TransportFactory.create(
         this.transportConfig,
         logger as ILogger
       );
       
       await this.transport.connect(this.server);
       
       // Для HTTP транспорту зберегти посилання на httpServer
       if (this.transportConfig.type !== "stdio") {
         const httpTransport = this.transport as StreamableHttpTransport | SSETransport;
         this.httpServer = httpTransport.getHttpServer();
       }
       
       logger.info("Server connected", {
         type: "SERVER_READY",
         transport: this.transportConfig.type,
       });
     }
     
     private async shutdown() {
       if (this.transport) {
         await this.transport.close();
       }
       // HTTP server cleanup вже в transport.close()
     }
   }
   ```

**Чеклист:**
- [ ] Видалити transport код з `src/index.ts`
- [ ] Додати імпорти transport layer
- [ ] Оновити `mcp_abap_adt_server` клас
- [ ] Оновити `run()` метод
- [ ] Оновити `shutdown()` метод
- [ ] Перевірити що все працює

---

### Етап 9: Налаштування monorepo (1-2 години)

#### 9.1 Оновити root `package.json`

**Додати workspace:**
```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

#### 9.2 Створити `pnpm-workspace.yaml` (якщо використовуємо pnpm)

```yaml
packages:
  - 'packages/*'
```

#### 9.3 Оновити `tsconfig.json` для project references

```json
{
  "compilerOptions": {
    // ...
  },
  "references": [
    { "path": "./packages/transport" }
  ]
}
```

#### 9.4 Оновити `src/index.ts` package.json для залежності

```json
{
  "dependencies": {
    "@mcp-abap-adt/transport": "workspace:*"
  }
}
```

**Чеклист:**
- [ ] Налаштувати monorepo tool
- [ ] Створити workspace конфігурацію
- [ ] Налаштувати TypeScript project references
- [ ] Додати залежність в server package.json

---

### Етап 10: Тестування (2-3 години)

#### 10.1 Unit тести для transport layer

**Створити тести:**
- `packages/transport/src/config/parser.test.ts`
- `packages/transport/src/transports/StdioTransport.test.ts`
- `packages/transport/src/transports/StreamableHttpTransport.test.ts`
- `packages/transport/src/transports/SSETransport.test.ts`
- `packages/transport/src/transports/TransportFactory.test.ts`

#### 10.2 Integration тести

**Перевірити:**
- [ ] STDIO transport працює
- [ ] StreamableHTTP transport працює
- [ ] SSE transport працює
- [ ] Server коректно використовує transport layer
- [ ] Shutdown працює коректно

#### 10.3 E2E тести

**Перевірити:**
- [ ] Запуск сервера з різними транспортами
- [ ] Всі існуючі тести проходять
- [ ] Немає регресій

**Чеклист:**
- [ ] Написати unit тести
- [ ] Написати integration тести
- [ ] Запустити всі існуючі тести
- [ ] Перевірити що немає регресій

---

### Етап 11: Документація (1 година)

#### 11.1 Створити `packages/transport/README.md`

**Включити:**
- Опис пакету
- Приклади використання
- API документацію
- Приклади конфігурації

#### 11.2 Оновити основний README

**Додати інформацію про:**
- Структуру monorepo
- Як використовувати transport layer окремо

**Чеклист:**
- [ ] Створити README для transport пакету
- [ ] Оновити основний README
- [ ] Додати приклади використання

---

## Оцінка часу

| Етап | Час | Пріоритет |
|------|-----|-----------|
| 1. Підготовка структури | 1-2 год | Високий |
| 2. Типи та інтерфейси | 1-2 год | Високий |
| 3. Парсер конфігурації | 2-3 год | Високий |
| 4. Обгортки транспорту | 3-4 год | Високий |
| 5. Фабрика транспорту | 1-2 год | Високий |
| 6. Вирішення logger | 1 год | Високий |
| 7. Головний експорт | 30 хв | Середній |
| 8. Оновлення server | 2-3 год | Високий |
| 9. Налаштування monorepo | 1-2 год | Високий |
| 10. Тестування | 2-3 год | Високий |
| 11. Документація | 1 год | Середній |

**Загальний час: 15-22 години (2-3 робочі дні)**

---

## Ризики та виклики

### 1. Залежність від logger
**Проблема:** Transport layer потребує logger, але не повинен залежати від server
**Рішення:** Створити `ILogger` інтерфейс, передавати logger як залежність

### 2. Управління HTTP сервером
**Проблема:** SSE та HTTP транспорти створюють HTTP сервер, який потрібен для shutdown
**Рішення:** Метод `getHttpServer()` в transport класах, або включити cleanup в `close()`

### 3. Тестування транспорту
**Проблема:** Транспорти залежать від MCP SDK, потрібні mock об'єкти
**Рішення:** Використовувати jest mocks для MCP SDK

### 4. TypeScript project references
**Проблема:** Можливі проблеми з type resolution між пакетами
**Рішення:** Правильна налаштування tsconfig.json з references

---

## Критерії готовності

✅ **Transport layer готовий, коли:**
- [ ] Всі типи та інтерфейси створені
- [ ] Парсер конфігурації працює
- [ ] Всі три транспорти реалізовані
- [ ] Фабрика транспорту працює
- [ ] Server використовує transport layer
- [ ] Всі тести проходять
- [ ] Документація оновлена
- [ ] Немає регресій

---

## Наступні кроки після завершення

1. Виділити connection layer
2. Виділити utils
3. Рефакторинг server для використання всіх пакетів

