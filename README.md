# Marketplace Analytics

Frontend-приложение для расчёта метрик маркетплейсов по CSV и выгрузки отчёта в PDF.

## Локальный запуск

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

## Деплой на GitHub Pages

В проекте уже настроен workflow автодеплоя:
`/.github/workflows/deploy-pages.yml`.

### 1. Запушить в `main`

```bash
git add .
git commit -m "Setup GitHub Pages deploy"
git push origin main
```

### 2. Включить GitHub Pages через Actions

В репозитории GitHub:

1. `Settings` → `Pages`
2. В `Build and deployment` выбрать `Source: GitHub Actions`

### 3. Проверить деплой

1. Открыть вкладку `Actions`
2. Дождаться завершения workflow `Deploy To GitHub Pages`
3. Открыть URL из шага `deploy` (или из `Settings` → `Pages`)

После этого каждый новый push в `main` будет автоматически пересобирать и выкатывать сайт.

## Что важно в этой настройке

- В `vite.config.ts` установлен `base: './'` для корректной работы ассетов на GitHub Pages.
- В workflow публикуется папка `dist`, собранная через `npm run build`.
