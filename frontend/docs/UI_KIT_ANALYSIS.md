# UI Kit Analysis (marketplace-analytics)

## Что уже выделено в `shared/ui-kit`

1. `UiPanel`
- Путь: `src/shared/ui-kit/panel/UiPanel.tsx`
- Покрывает: единый контейнер панели с заголовком/хедером.
- Где используется: блок варианта расчёта, фильтр артикулов, загрузка файла, сворачиваемые панели.

2. `UiTabs`
- Путь: `src/shared/ui-kit/tabs/UiTabs.tsx`
- Покрывает: переключатели сегментов (равноширинные кнопки).
- Где используется: выбор маркетплейса, выбор режима Ozon.

3. `UiSectionToggle`
- Путь: `src/shared/ui-kit/section-toggle/UiSectionToggle.tsx`
- Покрывает: заголовок сворачиваемого блока с иконкой состояния.
- Где используется: "Метрики для расчёта", "Дополнительные параметры".

## Выявленные кандидаты на следующий этап выноса в UI kit

1. `UiNotice`
- Текущие классы: `.loader`, `.warning`, `.error`.
- Повтор: одинаковый паттерн "плашка + цветовой статус + текст".
- Предложение: `UiNotice` с `variant: info | warning | error`.

2. `UiIconButton`
- Текущие классы: `.copy-group-icon-btn`, `.copy-article-btn`.
- Повтор: квадратная кнопка с иконкой, hover/disabled.
- Предложение: единый `UiIconButton` (`size`, `disabled`, `aria-label`).

3. `UiResultTable`
- Текущие классы: `.result-list`, `.result-row`, `.result-row-with-share`, `.result-row-compact`.
- Повтор: таблицеподобный список метрик в двух виджетах.
- Предложение: обобщённый компонент строк результатов с вариантами колонок.

4. `UiCollapsibleCard`
- Текущие классы: `availability-*` и `product-margin-*`.
- Повтор: `details/summary`-карточка со стрелкой и раскрываемым контентом.
- Предложение: унифицированный базовый collapsible с цветовой схемой/слотом контента.

## SCSS статус

- В проекте подключён `sass` и активирован `app.scss`.
- Добавлены SCSS partials:
  - `src/app/styles/_tokens.scss`
  - `src/app/styles/_mixins.scss`
- Базовые паттерны (`panel`, `tabs`, `section-toggle`) переведены на токены/миксины.
