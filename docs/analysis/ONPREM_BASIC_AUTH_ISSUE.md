# Проблема: JWT token has expired для on-premise систем з --mcp параметром

## Проблема

При підключенні до on-premise системи з використанням `--mcp=e19 --unsafe` запит до ABAP повертає помилку "JWT token has expired". Для on-premise систем потрібен тільки пароль та логін без сервісних ключів, але система намагається використовувати JWT токен.

## Аналіз коду

### 1. Створення AuthBroker з --mcp параметром

Коли використовується `--mcp=e19 --unsafe`:
- Створюється `AuthBroker` з `sessionStore` та `serviceKeyStore` (рядки 1097-1212 в `src/index.ts`)
- `sessionStore` завантажує дані з `.env` файлів для destination `e19`

### 2. Обробка MCP destination в applyAuthHeaders()

У `applyAuthHeaders()` для `AuthMethodPriority.MCP_DESTINATION` (рядки 1431-1500):
```typescript
// Get token from AuthBroker
const jwtToken = await authBroker.getToken(config.destination);
```

**Проблема**: Код завжди намагається отримати JWT токен, навіть для on-premise систем, які використовують basic auth.

### 3. Session Store не підтримує basic auth

`AbapSessionStore.getConnectionConfig()` (рядки 274-293):
```typescript
if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
  this.log?.warn(`Connection config for ${destination} missing required fields: jwtToken(${!!sessionConfig.jwtToken}), sapUrl(${!!sessionConfig.sapUrl})`);
  return null;
}
```

**Проблема**: Session store очікує JWT токен і повертає `null`, якщо його немає. Для on-premise систем JWT токен не потрібен.

### 4. envLoader не завантажує username/password

`envLoader.ts` (рядки 31-98):
- Завантажує тільки JWT токени та UAA конфігурацію
- Не завантажує `SAP_USERNAME` та `SAP_PASSWORD` для basic auth

### 5. Header Validator вважає MCP destination завжди JWT

`headerValidator.ts` (рядок 172):
```typescript
authType: AUTH_TYPE_JWT, // MCP destination always uses JWT
```

**Проблема**: Валідатор вважає, що `x-mcp-destination` завжди використовує JWT, але для on-premise систем потрібен basic auth.

## Рішення (Оновлено)

### Нова логіка створення stores

Згідно з вимогами:
1. **Звичайна ситуація (з AuthBroker)**: Коли протокол stdio та:
   - НЕ вказано --mcp
   - АБО вказано --env
   - АБО не вказано ні --mcp ні --env, але знайдено .env в поточному фолдері
   → Створюємо serviceKeyStore, sessionStore та tokenProvider для інжектування в брокер

2. **Спеціальна ситуація (тільки serviceKeyStore)**: Коли вказано --mcp (для on-premise)
   → Створюємо тільки serviceKeyStore (без sessionStore та tokenProvider)
   → Дані завантажуються з destination в --mcp або з файлу по --env або з .env з поточного фолдера

### Варіант 1: Додати підтримку basic auth в session store

1. **Розширити `EnvConfig` інтерфейс** в `envLoader.ts`:
   - Додати `username?: string`
   - Додати `password?: string`
   - Додати `authType?: 'basic' | 'jwt'`

2. **Оновити `loadEnvFile()`** для завантаження username/password:
   ```typescript
   if (parsed['SAP_USERNAME']) {
     config.username = parsed['SAP_USERNAME'].trim();
   }
   if (parsed['SAP_PASSWORD']) {
     config.password = parsed['SAP_PASSWORD'].trim();
   }
   // Визначити authType: якщо є username/password і немає jwtToken, то basic
   if (config.username && config.password && !config.jwtToken) {
     config.authType = 'basic';
   } else if (config.jwtToken) {
     config.authType = 'jwt';
   }
   ```

3. **Оновити `AbapSessionStore.getConnectionConfig()`** для підтримки basic auth:
   ```typescript
   async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
     const sessionConfig = await this.loadRawSession(destination);
     if (!sessionConfig) {
       return null;
     }

     // Для basic auth: перевірити username/password
     if (sessionConfig.authType === 'basic' || (!sessionConfig.jwtToken && sessionConfig.username && sessionConfig.password)) {
       return {
         serviceUrl: sessionConfig.sapUrl,
         username: sessionConfig.username,
         password: sessionConfig.password,
         sapClient: sessionConfig.sapClient,
         language: sessionConfig.language,
         authType: 'basic',
       };
     }

     // Для JWT auth: перевірити jwtToken
     if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
       return null;
     }
     return {
       serviceUrl: sessionConfig.sapUrl,
       authorizationToken: sessionConfig.jwtToken,
       sapClient: sessionConfig.sapClient,
       language: sessionConfig.language,
       authType: 'jwt',
     };
   }
   ```

4. **Оновити `applyAuthHeaders()`** для підтримки basic auth з MCP destination:
   ```typescript
   case AuthMethodPriority.MCP_DESTINATION: {
     // ...
     const connConfig = await authBroker.getConnectionConfig(config.destination);
     if (!connConfig || !connConfig.serviceUrl) {
       return;
     }
     const sapUrl = connConfig.serviceUrl;

     // Перевірити authType з connection config
     if (connConfig.authType === 'basic' || (connConfig.username && connConfig.password)) {
       // Basic auth для on-premise
       this.processBasicAuthConfigUpdate(
         sapUrl,
         connConfig.username!,
         connConfig.password!,
         sessionId
       );
     } else {
       // JWT auth для cloud
       const jwtToken = await authBroker.getToken(config.destination);
       this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);
     }
     return;
   }
   ```

5. **Оновити `IConnectionConfig` інтерфейс** для підтримки basic auth:
   ```typescript
   export interface IConnectionConfig {
     serviceUrl: string;
     authorizationToken?: string; // Для JWT
     username?: string; // Для basic auth
     password?: string; // Для basic auth
     authType?: 'basic' | 'jwt'; // Тип аутентифікації
     sapClient?: string;
     language?: string;
   }
   ```

### Варіант 2: Використовувати .env файл напряму для on-premise

Якщо `--mcp` вказує на on-premise систему, можна завантажувати конфігурацію напряму з `.env` файлу без використання AuthBroker для JWT токенів.

## Рекомендації

1. **Додати підтримку basic auth в session store** (Варіант 1) - це дозволить використовувати `--mcp` для on-premise систем
2. **Оновити header validator** для підтримки basic auth з MCP destination
3. **Додати тести** для перевірки basic auth з `--mcp` параметром
4. **Оновити документацію** про підтримку basic auth з `--mcp` параметром

## Файли для змін

1. `mcp-abap-adt-auth-stores/src/storage/abap/envLoader.ts` - додати завантаження username/password
2. `mcp-abap-adt-auth-stores/src/stores/abap/AbapSessionStore.ts` - додати підтримку basic auth в getConnectionConfig
3. `mcp-abap-adt/src/index.ts` - оновити applyAuthHeaders() для підтримки basic auth з MCP destination
4. `mcp-abap-adt-header-validator/src/headerValidator.ts` - оновити валідацію для підтримки basic auth з MCP destination
5. `mcp-abap-adt-interfaces/src/session/ISessionStore.ts` - оновити IConnectionConfig інтерфейс

