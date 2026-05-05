# План: хранение себестоимостей и backend-расчет метрик

## Контекст и цель

Нужно перейти от сценария, где frontend получает raw rows и считает все метрики сам, к гибридной модели:

- файл себестоимостей хранится на backend и привязан к организации;
- frontend продолжает хранить копию файла в IndexedDB, чтобы не сломать текущий локальный расчет;
- backend получает параметры фильтрации и считает `atoms`, `molecules`, `cells`;
- рассчитанные метрики по каждой неделе кешируются в БД;
- решение должно масштабироваться на Ozon без копирования WB-специфичной архитектуры.

Ключевое допущение: на первом этапе raw WB-отчеты остаются в текущем storage как JSON-файлы, а себестоимость хранится либо файлом, либо нормализованной таблицей в БД. Для расчета метрик предпочтительнее таблица, для совместимости с текущим frontend нужна также возможность скачать исходный/компактный CSV.

## Рекомендуемая целевая модель

Сделать общий pipeline:

1. `marketplace raw report` -> сохраненный artifact.
2. `raw rows` -> `normalized rows`.
3. `normalized rows + cogs + filters` -> `atoms`.
4. `atoms + params` -> `molecules`.
5. `molecules + params` -> `cells`.
6. `cells + breakdowns + dataQuality` -> frontend.

Для WB и Ozon различаться должны адаптеры, а не верхний API:

- `MarketplaceReportAdapter`
- `MarketplaceCogsAdapter`
- `MarketplaceMetricsCalculator`
- `MarketplaceMetricsPresenter`

## 1. Backend-хранение CSV себестоимостей

### Что нужно сделать

Добавить хранение файла себестоимостей, привязанное к `organizationId` и `marketplace`. Пользователь может загрузить CSV только если:

- он авторизован;
- он состоит в организации из auth context;
- для выбранного marketplace есть подключенный API-ключ;
- у роли есть право менять данные организации. Минимально: `owner`/`admin`, если роль `member` не должна менять справочники.

Frontend после успешной загрузки сохраняет тот же компактный CSV в IndexedDB, чтобы существующий локальный расчет продолжал работать без backend-метрик.

### Вариант хранения

Рекомендую хранить в двух формах:

1. Исходный/компактный CSV как artifact:
   - нужен для скачивания, восстановления IndexedDB, аудита и совместимости;
   - можно хранить в local storage abstraction сейчас и object storage позже.

2. Нормализованные строки в БД:
   - нужны для быстрых расчетов backend-метрик;
   - объем небольшой: в среднем около 500 строк, максимум несколько тысяч.

### Новые таблицы

`MarketplaceCogsFile`

- `id`
- `organizationId`
- `marketplace`
- `fileName`
- `filePath` или `storageKey`
- `fileSize`
- `fileHash`
- `mimeType`
- `rowsCount`
- `status`: `processing | ready | error`
- `errorMessage`
- `uploadedByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Индекс:

- unique active file на организацию и marketplace: `organizationId + marketplace`, с учетом `deletedAt`.

`MarketplaceCogsItem`

- `id`
- `organizationId`
- `marketplace`
- `cogsFileId`
- `article`
- `articleNormalized`
- `articleDigits`
- `unitCost`
- `currency`
- `createdAt`
- `updatedAt`

Индексы:

- `organizationId + marketplace + articleNormalized`
- `organizationId + marketplace + articleDigits`
- `cogsFileId`

### Backend endpoints

`PUT /api/marketplaces/:marketplace/cogs`

Назначение: загрузить или заменить файл себестоимости.

Вход:

- `multipart/form-data` с CSV-файлом;
- либо JSON `{ fileName, csvText }`, если пока не хочется добавлять multipart. Для текущего фронта JSON проще, но multipart лучше для файловой модели.

Ответ:

```json
{
  "cogsFile": {
    "id": "...",
    "marketplace": "wildberries",
    "fileName": "cogs.csv",
    "rowsCount": 523,
    "fileHash": "...",
    "updatedAt": "..."
  }
}
```

`GET /api/marketplaces/:marketplace/cogs`

Назначение: получить metadata активного файла.

Ответ:

```json
{
  "cogsFile": {
    "id": "...",
    "marketplace": "wildberries",
    "fileName": "cogs.csv",
    "rowsCount": 523,
    "updatedAt": "..."
  }
}
```

`GET /api/marketplaces/:marketplace/cogs/download`

Назначение: вернуть компактный CSV, чтобы frontend мог восстановить IndexedDB или использовать локальный расчет.

`DELETE /api/marketplaces/:marketplace/cogs`

Назначение: soft-delete активного файла и связанных строк.

### Шаги реализации

1. Добавить Prisma-модели `MarketplaceCogsFile` и `MarketplaceCogsItem`.
2. Добавить миграцию и индексы.
3. Вынести storage interface, если его еще нет:
   - `putText`
   - `getText`
   - `delete`
   - `exists`
4. Реализовать parser для COGS:
   - общий `parseCogsCsv`;
   - marketplace-specific mapping колонок;
   - WB: текущие правила `Артикул` + `Себестоимость`;
   - нормализация `full` и `digits`.
5. Реализовать `CogsService`:
   - проверить auth и marketplace connection;
   - сохранить файл;
   - распарсить строки;
   - заменить активный справочник в транзакции;
   - вернуть metadata.
6. Добавить routes:
   - upload;
   - metadata;
   - download;
   - delete.
7. На frontend:
   - после upload на backend сохранить компактный CSV в IndexedDB;
   - при открытии страницы, если IndexedDB пустой, попробовать скачать backend COGS;
   - если backend недоступен, текущий IndexedDB-flow должен продолжать работать.

### Чекпоинты

- Пользователь без авторизации получает `401`.
- Пользователь без WB/Ozon connection получает `409` или `422` с понятным сообщением.
- Пользователь из другой организации не может читать или менять COGS.
- Повторная загрузка заменяет активный файл и строки.
- `GET download` возвращает CSV, который текущий frontend умеет использовать.
- IndexedDB продолжает работать после успешной загрузки.
- Невалидный CSV возвращает список проблемных колонок.
- `npm run lint` проходит.
- Добавлены unit-тесты parser-а и service-level тесты на replace/delete.

## 2. Endpoint для atoms/molecules/cells и кеширование недельных метрик

### Что нужно сделать

Добавить новый endpoint, который принимает параметры фильтрации и возвращает рассчитанные backend-метрики. В расчете использовать сохраненный COGS-файл или нормализованную COGS-таблицу.

Метрики по каждой неделе нужно хранить в БД, чтобы повторный запрос не проходил заново по raw rows.

### Важное архитектурное решение

Не хранить только финальные `cells` для произвольного запроса. У пользователя есть параметры:

- период;
- article pattern;
- exclude/include pattern;
- price min/max;
- НДС;
- налог;
- COGS matching mode.

Часть параметров меняет сам набор строк, часть меняет только derived-расчет.

Поэтому хранить нужно минимум:

1. Недельные агрегаты без пользовательских фильтров.
2. При необходимости - кеш конкретного запроса с filter signature.

Практичный этап 1:

- считаем недельные metrics cache для базового набора строк;
- для фильтров article/price сначала можно пересчитывать из raw rows;
- затем добавить filter-specific cache, если будет реальная нагрузка.

Более правильный этап 2:

- хранить нормализованные строки в БД;
- считать агрегаты SQL-запросами или materialized summaries.

### Новые таблицы

`MarketplaceWeeklyMetricSnapshot`

- `id`
- `organizationId`
- `marketplace`
- `reportType`
- `periodFrom`
- `periodTo`
- `sourceReportId`
- `cogsFileId`
- `cogsHash`
- `calculatorVersion`
- `status`: `processing | ready | error`
- `atoms Json`
- `molecules Json`
- `cells Json`
- `breakdowns Json`
- `dataQuality Json`
- `rowsCount`
- `createdAt`
- `updatedAt`
- `calculatedAt`
- `errorMessage`

Unique:

- `organizationId + marketplace + reportType + periodFrom + periodTo + cogsHash + calculatorVersion`

`MarketplaceMetricRequestCache` опционально, вторым этапом:

- `id`
- `organizationId`
- `marketplace`
- `periodFrom`
- `periodTo`
- `filterHash`
- `requestParams Json`
- `result Json`
- `sourceSnapshotIds Json`
- `calculatorVersion`
- `createdAt`
- `expiresAt`

### Endpoint

`POST /api/marketplaces/:marketplace/metrics/accrual`

Вход:

```json
{
  "periodFrom": "2026-04-06",
  "periodTo": "2026-04-19",
  "filters": {
    "articlePattern": "*",
    "excludeArticlePattern": false,
    "priceMin": null,
    "priceMax": null
  },
  "params": {
    "vatRatePercent": 5,
    "taxRatePercent": 6,
    "cogsMatchingMode": "full"
  },
  "include": {
    "atoms": true,
    "molecules": true,
    "cells": true,
    "breakdowns": true,
    "dataQuality": true
  }
}
```

Ответ:

```json
{
  "marketplace": "wildberries",
  "requestedPeriod": {
    "from": "2026-04-06",
    "to": "2026-04-19"
  },
  "availablePeriod": {
    "from": "2026-04-06",
    "to": "2026-04-19"
  },
  "source": {
    "weeklyReports": [
      {
        "id": "...",
        "periodFrom": "2026-04-06",
        "periodTo": "2026-04-12",
        "metricsCache": "hit"
      }
    ],
    "cogsFileId": "...",
    "calculatorVersion": "wb-accrual-v1"
  },
  "rowCount": 1248,
  "atoms": {},
  "molecules": {},
  "cells": {},
  "breakdowns": {
    "expenses": [],
    "salesScheme": [],
    "dailyDynamics": [],
    "reasonStructure": []
  },
  "dataQuality": {
    "cogsMatchedRows": 490,
    "missingCogsArticles": [],
    "warnings": []
  }
}
```

### Расчетный слой

Для переиспользования с frontend лучше перенести текущую доменную логику из frontend в общую форму:

- либо скопировать formulas в backend как первый прагматичный шаг;
- либо вынести общую package-библиотеку позже.

На backend сделать:

- `normalizeWbApiRowsToAccrualRows`;
- `buildWbAccrualAtoms`;
- `buildWbAccrualMolecules`;
- `buildWbAccrualCells`;
- `buildWbAccrualBreakdowns`;
- `buildWbDataQuality`.

Для Ozon должен появиться такой же набор, но за общим интерфейсом.

### Кеширование недель

Алгоритм:

1. По `periodFrom/periodTo` определить нужные недельные reports.
2. Для каждой недели получить или загрузить raw report artifact.
3. Проверить наличие `MarketplaceWeeklyMetricSnapshot` по:
   - organization;
   - marketplace;
   - week;
   - cogsHash;
   - calculatorVersion.
4. Если snapshot есть и `ready`, использовать его.
5. Если нет, создать `processing` snapshot с атомарной блокировкой.
6. Прочитать raw rows.
7. Нормализовать rows.
8. Применить COGS.
9. Посчитать atoms/molecules/cells/breakdowns.
10. Сохранить snapshot.
11. Для пользовательского периода объединить недельные snapshots.

Важный нюанс: объединять можно не все `cells`. Надежнее объединять:

- atoms суммированием;
- некоторые breakdowns суммированием по ключам;
- molecules/cells пересчитывать поверх объединенных atoms и params.

### Чекпоинты

- Первый запрос за неделю создает snapshot.
- Повторный запрос с тем же COGS и calculatorVersion дает cache hit.
- Изменение COGS создает новый snapshot, старый не используется.
- Изменение `vatRatePercent`/`taxRatePercent` не требует перечитывать raw rows: cells пересчитываются из atoms.
- Недельные atoms корректно объединяются в период из нескольких недель.
- Фильтры article/price работают предсказуемо. Если они пока не кешируются, это явно видно в `source`.
- Ответ не содержит raw rows.
- Добавлены тесты:
  - расчет atoms на fixture;
  - расчет cells из atoms;
  - cache hit/miss по `cogsHash`;
  - объединение двух недель;
  - invalidation при смене calculatorVersion.

## 3. Встраивание endpoint на frontend

### Рекомендация

Не дорабатывать напрямую пропсы всех компонентов под backend-ответ. Лучше добавить адаптерный слой, который превращает backend metrics response в уже существующую модель UI: `AccrualGroup[]`, `topProducts`, `missingCogsArticles`, `periodLabel`.

Это даст гибкость для Ozon и позволит постепенно заменить локальный расчет.

### Новый frontend-слой

Добавить:

- `src/entities/marketplace-metrics`
- `src/entities/wildberries-report/model/backend-metrics-adapter.ts`
- позднее `src/entities/ozon-report/model/backend-metrics-adapter.ts`

Общий тип:

```ts
type MarketplaceMetricsResponse = {
  marketplace: 'wildberries' | 'ozon'
  requestedPeriod: { from: string; to: string }
  availablePeriod: { from: string; to: string }
  rowCount: number
  atoms?: Record<string, number | null>
  molecules?: Record<string, number | null>
  cells?: Record<string, number | null>
  breakdowns?: Record<string, unknown>
  dataQuality?: Record<string, unknown>
}
```

WB adapter:

- `mapWbBackendMetricsToAccrualGroups(response): AccrualGroup[]`
- `mapWbBackendMetricsToTopProducts(response)` - если top products будут в backend response;
- `mapWbBackendDataQuality(response)` для missing COGS/warnings.

### Изменения в странице WB

Текущий `useWildberriesAnalyticsPage` должен поддерживать два источника:

1. `backendMetrics` - при наличии авторизации, API-ключа и выбранного периода.
2. `localRows/localCsv` - fallback для CSV/IndexedDB и offline-like сценария.

Логика выбора:

- если пользователь запросил backend metrics и запрос успешен, UI строится из backend response;
- если backend metrics недоступны, используется текущий flow из `apiAccrualRows` или CSV;
- COGS upload всегда сохраняет файл на backend и в IndexedDB;
- если backend COGS есть, но IndexedDB пустой, frontend скачивает CSV и кладет в IndexedDB.

### Почему не менять сразу пропсы компонентов

Текущие компоненты уже умеют рисовать `AccrualGroup[]`. Если заставить их понимать `atoms/molecules/cells`, UI станет зависеть от расчетной модели и будет сложнее добавить Ozon.

Лучше оставить компоненты презентационными:

- `AccrualResults` получает `AccrualGroup[]`;
- `AccrualCostStructure` получает уже подготовленные группы;
- `ProductMarginPanel` получает готовые rows/items;
- страница решает, пришли данные из backend или посчитаны локально.

### Шаги реализации

1. Добавить frontend API client:
   - `fetchMarketplaceCogsMetadata`;
   - `uploadMarketplaceCogs`;
   - `downloadMarketplaceCogsCsv`;
   - `fetchMarketplaceMetrics`.
2. Добавить WB backend metrics adapter.
3. В `useWildberriesAnalyticsPage` добавить `useQuery` для metrics endpoint.
4. Переключить `reports` на источник:
   - backend metrics -> adapter -> `AccrualGroup[]`;
   - иначе текущий локальный builder.
5. Сохранить текущий API rows endpoint как временный fallback/debug.
6. Добавить hydration COGS из backend в IndexedDB.
7. Позже повторить для Ozon через `ozon backend metrics adapter`, не меняя UI-компоненты.

### Чекпоинты

- При подключенном WB и загруженном COGS страница может построить отчет без получения raw rows.
- При ошибке backend metrics текущий CSV/API rows flow продолжает работать.
- COGS после upload есть и на backend, и в IndexedDB.
- После очистки IndexedDB frontend может скачать COGS с backend.
- UI-компоненты получают прежнюю модель данных и не знают про backend atoms.
- Для Ozon нужно добавить новый adapter и calculator, а не переписывать компоненты.

## Общие риски

1. Расхождение формул frontend/backend.
   - Митигировать fixtures-тестами: один и тот же набор WB rows должен давать одинаковые atoms/cells.

2. COGS влияет на кеш метрик.
   - В ключ кеша обязательно включать `cogsHash` и `calculatorVersion`.

3. Фильтры могут взорвать количество кешей.
   - На первом этапе кешировать только базовые недельные snapshots, filter-specific cache добавить после измерений.

4. Raw JSON storage пока остается узким местом.
   - Новый metrics endpoint уменьшит нагрузку на сеть и браузер, но backend все еще читает JSON. Следующий этап - normalized rows в БД или аналитическое хранилище.

5. Нельзя слишком рано зацементировать WB-модель.
   - Все новые таблицы и endpoints лучше называть `Marketplace...`, WB держать в adapter/calculator.

## Рекомендуемый порядок работ

1. COGS backend storage + IndexedDB sync.
2. WB metrics calculator на backend без кеша, проверенный fixtures.
3. Weekly metric snapshots в БД.
4. Новый frontend adapter для WB metrics response.
5. Переключение WB-страницы на backend metrics с fallback.
6. Вынос общих интерфейсов под Ozon.
7. Ozon calculator и adapter.

## Definition of Done

- Backend хранит активный COGS-файл по организации и marketplace.
- Frontend сохраняет COGS и на backend, и в IndexedDB.
- Backend endpoint возвращает `atoms/molecules/cells/breakdowns/dataQuality` без raw rows.
- Недельные метрики кешируются в БД с учетом `cogsHash` и `calculatorVersion`.
- WB-страница может работать от backend metrics response через adapter.
- Старый frontend-расчет остается fallback.
- Добавлены тесты на parser, calculator, cache key и frontend adapter.
- `npm run lint` проходит в backend и frontend.
