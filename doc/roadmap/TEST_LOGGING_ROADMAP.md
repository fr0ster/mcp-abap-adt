# Roadmap: Test Logging via @mcp-abap-adt/logger

## Goals
- Уніфікувати логування інтеграційних тестів через `@mcp-abap-adt/logger` (Logger/ILogger/testLogger), без прямого `console.*`.
- Дозволити розділяти рівні/категорії (test, connection, auth, adt) та легко вмикати їх через env.
- Забезпечити можливість писати логи в окремі файли per suite при потребі аналізу.

## Tasks
- [ ] Додати тестовий логер на базі `testLogger` з категоріями:
  - `test` (кроки тестів),
  - `connection` (DEBUG_CONNECTORS),
  - `auth` (authHelpers),
  - `adt` (ADT-запити/handlers).
- [ ] Замінити ad-hoc `console.log/warn` у:
  - `src/__tests__/integration/helpers/sessionHelpers.ts`,
  - `src/__tests__/integration/helpers/testHelpers.ts`,
  - `src/__tests__/integration/helpers/authHelpers.ts`,
  - інтеграційних тестах (Class/Function/View/Behavior/...),
  на інстанси логера з рівнями (env `TEST_LOG_LEVEL` або мапа DEBUG_* → level).
- [ ] Додати опцію file-sink для тестового логера (env `TEST_LOG_FILE=/tmp/...`, один файл або per-suite з префіксом).
- [ ] Описати перемикачі в README/TESTING_AUTH.md:
  - `TEST_LOG_LEVEL` (`error|warn|info|debug`),
  - `DEBUG_TESTS/DEBUG_CONNECTORS/DEBUG_ADT_TESTS` мапити на `debug`,
  - `TEST_LOG_FILE` для запису в файл.
- [ ] (Опційно) Додати короткі кольорові/префіксні мітки категорій для легкого grep у stdout.
