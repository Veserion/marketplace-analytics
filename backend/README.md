# Сервер Marketplace Analytics

MVP backend для аккаунтов, организаций и API-ключей маркетплейсов.

Отчеты и загруженные файлы пока остаются в браузерном IndexedDB. Сервер хранит только данные аккаунта, членство в организации, метаданные подключений маркетплейсов, зашифрованные API-ключи и события аудита.

## Стек

- Fastify
- TypeScript
- Prisma
- PostgreSQL
- JWT-токены доступа
- шифрование ключей через AES-256-GCM
- email-коды для регистрации и входа

## Локальный запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env` на основе `.env.example`.

Сгенерировать ключ шифрования:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

3. Запустить Postgres:

```bash
docker compose up -d
```

4. Применить миграции базы данных:

```bash
npm run prisma:migrate
```

5. Запустить API:

```bash
npm run dev
```

Проверка работоспособности:

```bash
curl http://localhost:4000/health
```

## API

Публичные endpoints:

- `POST /api/auth/email-code/request`
- `POST /api/auth/email-code/verify`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /health`

Endpoints с авторизацией через `Authorization: Bearer <token>`:

- `GET /api/me`
- `GET /api/marketplace-connections`
- `PUT /api/marketplace-connections/:marketplace/credentials`
- `DELETE /api/marketplace-connections/:marketplace/credentials`

Поддерживаемые значения `marketplace`:

- `ozon`
- `wildberries`

## Хранение API-ключей

Ключи шифруются перед записью в PostgreSQL. В ответах API возвращаются только маска ключа, статус и даты.

Не теряйте `ENCRYPTION_KEY`. Без него сохраненные ключи маркетплейсов нельзя будет расшифровать.

## Регистрация и вход по email-коду

Основной passwordless-flow:

1. Frontend отправляет email:

```bash
curl -X POST http://localhost:4000/api/auth/email-code/request \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

2. Сервер генерирует шестизначный код и отправляет его на email. Если SMTP не настроен, код выводится в лог сервера.

3. Frontend отправляет код:

```bash
curl -X POST http://localhost:4000/api/auth/email-code/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","code":"123456","name":"Иван"}'
```

Если пользователь с таким email уже есть, сервер залогинит его. Если пользователя нет, сервер создаст пользователя, организацию и вернет JWT.

Для реальной отправки писем заполните SMTP-переменные в `.env`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
