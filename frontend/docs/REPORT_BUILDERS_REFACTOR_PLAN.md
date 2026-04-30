# Report Builders Refactor Plan

## Цель

Разбить расчеты `report-builders` на атомарные, прослеживаемые шаги без изменения публичного API и пользовательского поведения.

Главный критерий: по коду должно быть легко пройти цепочку `CSV -> строки домена -> агрегаты -> метрики отчета`, а повторяющиеся операции должны переиспользоваться между Ozon и Wildberries.

## Ограничения

- Не менять публичные exports из `entities/ozon-report` и `entities/wildberries-report` без отдельного решения.
- Не переписывать формулы целиком за один шаг.
- Не менять UI-контракты `ReportGroup`, `AccrualGroup`, `AccrualMetric`.
- Не добавлять тесты в рамках текущей задачи.
- Каждый этап проверять через `npm run lint` и `npm run build`.

## Текущие проблемы

1. Парсинг CSV, нормализация, бизнес-формулы, группировки и презентационные тексты смешаны в двух больших файлах.
2. Ozon и Wildberries дублируют pattern matching, COGS parsing, сортировки, суммирование и форматирование долей.
3. Wildberries импортирует общие типы из `ozon-report`, что создает лишнюю связь между сущностями.
4. В расчетах много накопительных `let`-переменных, из-за чего сложнее понять происхождение итоговых метрик.
5. В некоторых местах отсутствующие данные превращаются в `0`, что затрудняет диагностику изменения формата CSV.

## Целевая Структура

Публичные builder-функции остаются фасадами:

1. `parse`
   - найти заголовок;
   - построить reader колонок;
   - отфильтровать пустые строки.

2. `normalize`
   - привести CSV-строки к доменным строкам;
   - нормализовать статьи, даты, причины, группы;
   - применить фильтр артикулов.

3. `aggregate`
   - собрать числовые агрегаты;
   - отдельно считать COGS, схемы работы, группы расходов, динамику.

4. `present`
   - превратить агрегаты в `ReportGroup[]` / `AccrualGroup[]`;
   - держать подписи и формулы ближе к финальному представлению.

## План Работ

### Этап 1. Общие атомы

Создать общий модуль для безопасных маленьких операций:

- фильтр артикулов по `*`/`?`;
- нормализация ключей;
- `addToNumberMap`;
- `sumNumberMap`;
- `sortByAbsDesc`;
- `toMetrics`;
- форматирование доли продаж.

Проверка: публичные функции компилируются, `lint` и `build` проходят.

### Этап 2. Общий CSV table reader

Создать маленький reader поверх `string[][]`:

- поиск строки заголовков;
- построение `headers`, `colIndex`, `getCell`;
- получение непустых data rows.

Проверка: builder-функции используют reader, поведение ошибок сохранено.

### Этап 3. COGS как общий пайплайн

Вынести общий пайплайн:

- parse COGS rows;
- compact CSV;
- average COGS map;
- marketplace-specific article key resolver.

Проверка: `extract*CogCsv` и `build*CogsMap` остаются совместимыми.

### Этап 4. Ozon

Разбить:

- unit economics: `aggregateOzonUnitRows`, `buildOzonUnitMetrics`, `buildAvailabilityGroups`, `buildProductMargins`;
- accrual: `parseOzonAccrualRows`, `aggregateOzonAccrualRows`, `buildOzonAccrualGroups`.

Проверка: внешний API и структура отчетов сохранены.

### Этап 5. Wildberries

Разбить:

- row normalization: `parseWildberriesRows`;
- sign rules: `getWildberriesRowAmount`;
- sales scheme resolver;
- `aggregateWildberriesAccrualRows`;
- `buildWildberriesAccrualGroups`;
- top products отдельно от accrual aggregation.

Проверка: внешний API и структура отчетов сохранены.

### Этап 6. Общие типы отчетов

Перенести общие типы `AccrualGroup`, `AccrualMetric`, `ValueType` из Ozon-сущности в общий модуль. Старые re-export оставить.

Проверка: Wildberries больше не зависит от `ozon-report/model/types`.

## Progress

- [x] Этап 1. Общие атомы
- [x] Этап 2. Общий CSV table reader
- [x] Этап 3. COGS как общий пайплайн, базовая часть
- [x] Этап 4. Ozon, unit economics и начисления
- [x] Этап 5. Wildberries, начисления и top products
- [x] Этап 6. Общие типы отчетов
- [x] Этап 7. Физическое разбиение builder-файлов на фасады и специализированные модули
- [x] Этап 8. Проверка обязательных CSV-колонок перед расчетами

## Выполнено В Этой Итерации

- Добавлен `src/shared/lib/reporting.ts` с атомарными операциями: CSV table reader, фильтр артикулов, нормализация ключей, суммирование в `Map`, сортировка по модулю, формат долей, усреднение по ключу.
- Добавлен `src/shared/lib/report-types.ts` для общих типов отчетов.
- `wildberries-report` больше не импортирует типы из `ozon-report`.
- Ozon начисления разделены на:
  - `calculateOzonAccrualCogs`;
  - `aggregateOzonAccrualRows`;
  - `buildOzonGroupedExpenseMetrics`;
  - `buildOzonStructureSummaries`;
  - `buildOzonAccrualReportGroups`.
- Ozon unit economics разделен на:
  - `sumOzonUnitColumn`;
  - `sumDefinedOzonUnitColumns`;
  - `calculateOzonUnitCogs`;
  - `aggregateOzonUnitRows`;
  - `buildOzonAvailabilityGroups`;
  - `buildOzonProductMargins`;
  - `buildOzonUnitMetrics`.
- Wildberries начисления разделены на:
  - `parseWildberriesRowsFromTable`;
  - `aggregateWildberriesAccrualRows`;
  - `buildWildberriesGroupedExpenseMetrics`;
  - `buildWildberriesSchemeMetrics`;
  - `buildWildberriesStructureSummaries`;
  - `buildWildberriesDateMetrics`;
  - `buildWildberriesAccrualReportGroups`.
- Wildberries top products разделен на:
  - `aggregateWildberriesTopProducts`;
  - `rankWildberriesTopProducts`.
- COGS compact CSV использует общие `parseCsvWithFallback` и `rowsToSemicolonCsv`.
- Публичные builder-функции оставлены фасадами и сохранили старые сигнатуры.
- Ozon физически разделен на:
  - `model/unit-economics-builder.ts`;
  - `model/accrual-builder.ts`;
  - `model/cogs-builder.ts`;
  - `model/report-builders.ts` как фасад re-export.
- Wildberries физически разделен на:
  - `model/accrual-builder.ts`;
  - `model/top-products-builder.ts`;
  - `model/cogs-builder.ts`;
  - `model/report-builders.ts` как фасад re-export.
- Добавлен `assertCsvColumns` для явной проверки обязательных заголовков перед расчетами.
- Проверка намеренно валидирует наличие колонок, но не падает на пустых числовых ячейках внутри строк: в отчетах маркетплейсов пустые значения могут быть нормальными для неприменимых операций.

## Следующие Безопасные Шаги

1. Вынести общий поиск COGS-заголовков в параметризуемый helper, если появится третий источник себестоимости.
2. Проверить на реальных CSV, что значения ключевых метрик совпадают до/после рефакторинга.
3. После ручной сверки значений можно точечно ужесточать обработку значений внутри строк, где сейчас используется `?? 0`.
