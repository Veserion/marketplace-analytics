Задача: доработать бэкенд для хранения и переиспользования WB API-отчётов.

Важное правило:
бэкенд должен оперировать только целыми финансовыми отчётами WB.

Даже если пользователь на фронте выбрал период в несколько дней, бэкенд не должен запрашивать эти несколько дней отдельно. Нужно определить, какие недельные отчёты WB покрывают выбранный период, загрузить эти недельные отчёты целиком, сохранить их, затем склеить строки и отфильтровать результат по датам пользователя.

Важно по входным данным:
фронтенд НЕ отправляет companyId и forceRefresh.

companyId нужно определять на стороне бэкенда из авторизованного пользователя / активной компании / контекста сессии.

forceRefresh в этом сценарии не используется в публичном запросе. Повторный запрос должен использовать кэш и дозагружать только отсутствующие недельные отчёты.

==================================================
1. Основная логика
==================================================

Фронт отправляет:

POST /api/wb-finance/sales-reports/detailed

Body:

{
  "periodFrom": "2026-04-10",
  "periodTo": "2026-04-18",
  "fields": ["docTypeName", "nmId", "forPay"]
}

Бэкенд должен:

1. Получить пользователя из auth-контекста.
2. Определить companyId на стороне бэкенда.
3. Принять пользовательский период.
4. Определить, какие недельные отчёты WB нужны для покрытия этого периода.
5. Проверить, есть ли эти недельные отчёты в локальном хранилище.
6. Если каких-то недельных отчётов нет — загрузить их целиком из WB API.
7. Сохранить каждый недельный отчёт отдельным JSON-файлом на сервере.
8. Прочитать все нужные недельные JSON-файлы.
9. Склеить rows.
10. Отфильтровать строки строго по пользовательскому periodFrom / periodTo.
11. Оставить только запрошенные fields.
12. Вернуть фронту итоговый JSON.

==================================================
2. Как получить companyId
==================================================

companyId не приходит с фронтенда.

Бэкенд должен определить его сам.

Возможные варианты:

1. Если в системе есть активная компания пользователя:
   companyId = currentUser.activeCompanyId

2. Если companyId хранится в JWT/session:
   companyId = authContext.companyId

3. Если пользователь состоит только в одной компании:
   взять эту компанию.

4. Если пользователь состоит в нескольких компаниях и активная компания не выбрана:
   вернуть ошибку:
   "Не выбрана активная компания."

Во всех случаях нужно проверить:
- пользователь авторизован;
- пользователь состоит в найденной компании;
- у пользователя есть право читать/получать WB-отчёты этой компании.

==================================================
3. Пример
==================================================

Пользователь выбрал:

10.04.2026 – 18.04.2026

Если финансовые недели WB:

06.04.2026 – 12.04.2026
13.04.2026 – 19.04.2026

Бэкенд должен загрузить/использовать оба отчёта целиком:

06.04 – 12.04
13.04 – 19.04

Затем склеить их строки и отфильтровать только:

10.04 – 18.04

То есть пользователь получает данные за свой период, но в кэше сервера лежат полные недельные отчёты WB.

==================================================
4. Что хранить в PostgreSQL
==================================================

Добавить таблицу wb_api_reports.

Пример:

create table wb_api_reports (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references companies(id),

  marketplace text not null default 'wildberries',

  report_type text not null default 'weekly_detailed',

  period_from date not null,
  period_to date not null,

  status text not null default 'processing',
  error_message text,

  rows_count integer not null default 0,

  file_name text,
  file_path text,
  file_size bigint,
  file_hash text,
  mime_type text not null default 'application/json',

  requested_fields jsonb not null default '[]'::jsonb,
  wb_endpoint text not null default '/api/wb-finance/sales-reports/detailed',

  requested_by_user_id uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refreshed_at timestamptz,
  deleted_at timestamptz
);

Индексы:

create index idx_wb_api_reports_company_period
on wb_api_reports(company_id, period_from, period_to);

create index idx_wb_api_reports_company_status
on wb_api_reports(company_id, status);

create unique index uniq_wb_api_report_week
on wb_api_reports(company_id, marketplace, report_type, period_from, period_to)
where deleted_at is null;

Важно:
period_from / period_to в wb_api_reports — это не произвольный пользовательский период, а период полного недельного отчёта WB.

==================================================
5. Где хранить файлы
==================================================

Каждый недельный отчёт сохранять отдельным JSON-файлом на сервере.

Пример пути:

/storage/wb-reports/{companyId}/{reportId}.json

Пример имени файла:

wb-weekly-report_2026-04-06_2026-04-12.json

В БД хранить:

fileName = "wb-weekly-report_2026-04-06_2026-04-12.json"
filePath = "/storage/wb-reports/company_123/report_456.json"
fileSize = размер файла
fileHash = sha256 содержимого
mimeType = "application/json"

Формат файла:

{
  "periodFrom": "2026-04-06",
  "periodTo": "2026-04-12",
  "rowsCount": 1248,
  "rows": [
    { "...": "..." }
  ]
}

==================================================
6. Как определить нужные недельные отчёты
==================================================

Нужна функция:

getRequiredWbWeeklyPeriods(userPeriodFrom, userPeriodTo)

Она должна вернуть список недельных периодов WB, которые пересекаются с пользовательским периодом.

Например:

userPeriodFrom = 2026-04-10
userPeriodTo = 2026-04-18

return:
[
  { from: "2026-04-06", to: "2026-04-12" },
  { from: "2026-04-13", to: "2026-04-19" }
]

Важно:
нужно использовать именно календарь закрытых финансовых недель WB.

Если отчёты WB закрываются по воскресеньям, то неделя:

понедельник – воскресенье

Пример:

06.04.2026 – 12.04.2026
13.04.2026 – 19.04.2026
20.04.2026 – 26.04.2026

==================================================
7. Как не запрашивать незакрытую неделю
==================================================

Если пользователь выбрал период, включающий текущую незакрытую неделю, не нужно пытаться загрузить её как финансовый отчёт, если WB ещё не сформировал отчёт.

Нужно определить последнюю закрытую неделю.

Например, сегодня среда 29.04.2026.
Последний закрытый отчёт WB доступен за:

20.04.2026 – 26.04.2026

Если пользователь выбрал:

01.04.2026 – 29.04.2026

Бэкенд должен загрузить только закрытые недельные отчёты.

Если дни после последнего закрытого отчёта недоступны, вернуть warning:

"WB ещё не сформировал финансовый отчёт за часть выбранного периода."

И вернуть:

requestedPeriod:
01.04.2026 – 29.04.2026

availablePeriod:
01.04.2026 – 26.04.2026

missingPeriod:
27.04.2026 – 29.04.2026

==================================================
8. Как проверять, какие недельные отчёты уже есть
==================================================

Для каждого required weekly period искать отчёт:

select *
from wb_api_reports
where company_id = :companyId
  and marketplace = 'wildberries'
  and report_type = 'weekly_detailed'
  and period_from = :weekFrom
  and period_to = :weekTo
  and status = 'ready'
  and deleted_at is null
limit 1;

Если есть — используем файл из filePath.
Если нет — загружаем этот недельный отчёт целиком из WB API.

==================================================
9. Как загружать недельный отчёт из WB API
==================================================

Для каждого отсутствующего недельного периода вызвать WB API:

POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed

Body:

{
  "dateFrom": "2026-04-06",
  "dateTo": "2026-04-12",
  "limit": 100000,
  "rrdId": 0,
  "fields": WB_DEFAULT_FIELDS
}

Поддержать пагинацию через rrdId:

let rrdId = 0;
const allRows = [];

while (true) {
  const response = await callWbApi({
    dateFrom: weekFrom,
    dateTo: weekTo,
    limit: 100000,
    rrdId,
    fields: WB_DEFAULT_FIELDS
  });

  const rows = response.rows ?? [];

  if (rows.length === 0) break;

  allRows.push(...rows);

  if (rows.length < 100000) break;

  rrdId = rows[rows.length - 1].rrdId;
}

После загрузки:
1. Создать JSON-файл.
2. Посчитать fileHash.
3. Посчитать fileSize.
4. Создать/обновить запись wb_api_reports.
5. status = ready.
6. rowsCount = allRows.length.

Если WB вернул 204 No data:
создать ready-отчёт с rowsCount = 0 и пустым JSON-файлом.
Это нужно, чтобы не запрашивать пустую закрытую неделю повторно.

==================================================
10. Какие поля запрашивать у WB
==================================================

Даже если фронт запросил несколько полей, у WB лучше запрашивать полный стандартный набор полей продукта.

Например:

const WB_DEFAULT_FIELDS = [
  "rrdId",
  "docTypeName",
  "sellerOperName",
  "nmId",
  "vendorCode",
  "sku",
  "title",
  "subjectName",
  "brandName",
  "orderDt",
  "saleDt",
  "rrDate",
  "retailPriceWithDisc",
  "commissionPercent",
  "forPay",
  "acquiringFee",
  "deliveryService",
  "paidStorage",
  "deduction",
  "paidAcceptance",
  "penalty",
  "additionalPayment",
  "ppvzReward",
  "rebillLogisticCost",
  "cashbackAmount",
  "cashbackDiscount",
  "cashbackCommissionChange",
  "srid",
  "orderUid"
];

fields из фронта использовать только для фильтрации ответа фронту.

==================================================
11. Склейка итогового JSON
==================================================

После того как все нужные недельные отчёты есть:

1. Прочитать файлы по filePath.
2. Собрать все rows в один массив.
3. Удалить дубли.
4. Отфильтровать строки по пользовательскому периоду.
5. Оставить только запрошенные fields.
6. Вернуть фронту.

Пример:

const weeklyReports = await getRequiredReports(companyId, requiredWeeks);

const allRows = [];

for (const report of weeklyReports) {
  const json = await readJson(report.filePath);
  allRows.push(...json.rows);
}

const dedupedRows = dedupeRows(allRows);

const filteredRows = dedupedRows.filter(row => {
  const rowDate = row.rrDate || row.saleDt || row.orderDt;
  return rowDate >= userPeriodFrom && rowDate <= userPeriodTo;
});

const responseRows = filteredRows.map(row => pick(row, requestedFields));

return {
  requestedPeriod: {
    from: userPeriodFrom,
    to: userPeriodTo
  },
  loadedWeeklyReports: weeklyReports.map(report => ({
    id: report.id,
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
    source: "cache" | "api"
  })),
  rowsCount: responseRows.length,
  fields: requestedFields,
  rows: responseRows
};

==================================================
12. Дедупликация строк
==================================================

На всякий случай при склейке дедуплицировать строки.

Ключ:

dedupeKey =
  row.rrdId
  || row.srid
  || `${row.srid}_${row.docTypeName}_${row.forPay}_${row.rrDate}`;

Лучше использовать rrdId, если он есть.

==================================================
13. Обновление данных
==================================================

Так как фронтенд не отправляет forceRefresh, публичный endpoint:

POST /api/wb-finance/sales-reports/detailed

работает в режиме:
- использовать кэш;
- загрузить только отсутствующие недельные отчёты;
- не перезагружать уже сохранённые ready-отчёты.

Если позже понадобится принудительное обновление, сделать отдельный endpoint, например:

POST /api/wb-finance/sales-reports/refresh

Body:

{
  "periodFrom": "2026-04-10",
  "periodTo": "2026-04-18"
}

Этот endpoint должен:
1. Определить companyId на бэкенде.
2. Определить required weekly periods.
3. Для каждой недели пометить старый отчёт deletedAt.
4. Загрузить каждую неделю заново из WB API.
5. Сохранить новые JSON-файлы.
6. Вернуть свежие данные.

Но в базовом сценарии refresh не нужен.

==================================================
14. Ответ endpoint
==================================================

Пример ответа:

{
  "requestedPeriod": {
    "from": "2026-04-10",
    "to": "2026-04-18"
  },
  "availablePeriod": {
    "from": "2026-04-10",
    "to": "2026-04-18"
  },
  "loadedWeeklyReports": [
    {
      "id": "report_1",
      "periodFrom": "2026-04-06",
      "periodTo": "2026-04-12",
      "source": "cache"
    },
    {
      "id": "report_2",
      "periodFrom": "2026-04-13",
      "periodTo": "2026-04-19",
      "source": "api"
    }
  ],
  "rowsCount": 532,
  "fields": ["docTypeName", "nmId", "forPay"],
  "rows": []
}

Если часть периода недоступна:

{
  "requestedPeriod": {
    "from": "2026-04-01",
    "to": "2026-04-30"
  },
  "availablePeriod": {
    "from": "2026-04-01",
    "to": "2026-04-26"
  },
  "missingPeriod": {
    "from": "2026-04-27",
    "to": "2026-04-30"
  },
  "warning": "WB ещё не сформировал финансовый отчёт за часть выбранного периода.",
  "rows": []
}

==================================================
15. Список сохранённых недельных отчётов
==================================================

Добавить endpoint:

GET /api/wb-finance/sales-reports

companyId также не передавать с фронта.
Бэкенд определяет companyId из auth-контекста.

Endpoint возвращает список сохранённых недельных отчётов текущей компании:

[
  {
    "id": "report_id",
    "periodFrom": "2026-04-06",
    "periodTo": "2026-04-12",
    "rowsCount": 1248,
    "status": "ready",
    "fileName": "wb-weekly-report_2026-04-06_2026-04-12.json",
    "createdAt": "...",
    "refreshedAt": "..."
  }
]

==================================================
16. Права доступа
==================================================

Все отчёты company-scoped.

Каждый endpoint должен:

1. Проверить авторизацию.
2. Определить companyId на стороне бэкенда.
3. Проверить, что пользователь состоит в этой компании.
4. Проверить наличие WB API-ключа компании/пользователя.

Пользователь одной компании не должен видеть отчёты другой компании.

==================================================
17. Что НЕ делать
==================================================

Не принимать companyId с фронтенда в этом endpoint.

Не принимать forceRefresh с фронтенда в этом endpoint.

Не запрашивать у WB API произвольные дневные куски, если пользователь выбрал несколько дней.

Не сохранять отчёт в БД как строки.

Не хранить CSV на бэкенде.

Не считать period_from / period_to в wb_api_reports пользовательским периодом.

Не создавать отчёты за пересекающиеся произвольные интервалы.

Единица хранения = один полный недельный отчёт WB.

==================================================
18. Критерии готовности
==================================================

Фича готова, если:

1. Фронт отправляет только periodFrom, periodTo и fields.
2. companyId определяется на бэкенде.
3. forceRefresh отсутствует в публичном detailed endpoint.
4. Бэкенд определяет нужные недельные отчёты WB.
5. Бэкенд загружает отсутствующие недельные отчёты целиком.
6. Каждый недельный отчёт сохраняется отдельным JSON-файлом.
7. Метаданные файла сохраняются в PostgreSQL.
8. Повторный запрос использует кэш.
9. Ответ фронту фильтруется по пользовательскому периоду.
10. Ответ содержит только requested fields.
11. Если часть периода ещё не закрыта WB, возвращается warning.
12. Отчёты изолированы по companyId.