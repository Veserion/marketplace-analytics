# Backend Refactoring Plan

## Context

Backend is currently an MVP Fastify + Prisma service with account/auth flows, marketplace credentials, WB report caching, and an in-process WB prefetch job.

Known constraints:

- Weekly WB report files are only a few MB each, so raw JSON artifact storage is acceptable for the next stage.
- WB Finance API is the hard bottleneck. After rate limit pressure, the next request must wait according to `X-Ratelimit-Retry`; burst recovery is described by `X-Ratelimit-Limit` and `X-Ratelimit-Reset`.
- Current implementation partially handles WB rate limits in the background sync retry path, but it does not provide a single global per-token/per-organization limiter and does not proactively schedule requests around the API cooldown.
- Ozon and other marketplaces will be added, so new code should not deepen WB-specific coupling.

Primary goal:

Make the backend reliable for WB first, then refactor the ingestion/reporting pipeline so Ozon can be added through adapters instead of copied service code.

Non-goals for the first pass:

- Do not move every raw report row into PostgreSQL immediately.
- Do not introduce a large analytics warehouse before report ingestion is stable.
- Do not redesign frontend analytics calculations unless backend API contracts require it.

## Target Architecture

The backend should move toward these boundaries:

- `MarketplaceAdapter`: marketplace-specific API calls, credential validation, period calculation, field mapping, and rate-limit parsing.
- `ReportArtifactService`: marketplace-neutral lifecycle for report artifacts: create, lock, fetch, store, mark ready/error, read metadata.
- `ReportStorage`: storage interface for local filesystem in development and object storage in production.
- `ReportJobQueue`: durable job records and worker execution, independent from Fastify request handling.
- `RateLimiter`: per marketplace + organization + credential limiter that serializes external API requests and respects `429` headers.

For the near term, raw report files can remain JSON artifacts. The important change is not the file format, but the lifecycle around loading, locking, retrying, and serving them.

## Phase 0 - Stabilize Current WB Flow

Purpose: fix correctness and operational risks before larger refactoring.

### Tasks

- [x] Fix WB API `204` handling before `response.json()`.
- [x] Add HTTP timeout with `AbortController` for every WB API request.
- [x] Normalize WB API errors into typed errors: rate limit, auth/invalid token, network timeout, server error, malformed response.
- [x] Move creation/update of `processing` report record before the external WB request.
- [x] Ensure every failed artifact load ends in `error` with `errorMessage`.
- [x] Use a unique insert/upsert strategy instead of `findFirst` followed by `create`, to reduce duplicate request races.
- [x] Use `organizationId` from auth context in WB routes instead of resolving "first organization" from user memberships.
- [x] Define behavior for empty `fields`: either reject it or return default WB fields. Avoid returning rows of empty objects.
- [x] Fix `getLastClosedWeek()` semantics for Sunday/current week availability.
- [x] Add RBAC check for saving/deleting marketplace credentials: only `owner`/`admin`.
- [x] Add rate limiting for email-code request and login endpoints.

### Checkpoint

Backend still exposes the same public WB endpoints, but:

- Parallel requests for the same weekly report do not trigger duplicate WB API fetches.
- Empty WB reports and `204` responses are handled as valid empty reports.
- Stuck `processing` records are rare and recoverable.
- Basic auth/security risks are reduced.

### Verification

- [x] `npm run lint`
- [x] Unit tests for WB week period calculation.
- [x] Unit tests for `204`, `429`, timeout, and malformed WB API responses.
- [ ] Unit tests for report status transitions: missing -> processing -> ready, processing timeout -> retry, failure -> error.
- [ ] Manual test: two concurrent requests for the same period produce one ready artifact.

## Phase 1 - Add Durable WB Rate Limiting

Purpose: make WB API access predictable under the documented rate limits.

### Tasks

- [x] Create `MarketplaceRateLimitState` table or equivalent durable state:
  - marketplace
  - organizationId
  - credential/connection id
  - blockedUntil
  - lastRetryAfterSeconds
  - lastResetSeconds
  - lastLimit
  - updatedAt
- [x] Add a single `WbRateLimiter` used by both HTTP-triggered fetches and background sync.
- [ ] Serialize WB requests per organization/connection. Start simple: one in-flight WB request per connection.
- [x] On `429`, persist `blockedUntil = now + X-Ratelimit-Retry + safety gap`.
- [x] If `X-Ratelimit-Reset` and `X-Ratelimit-Limit` are present, persist them for observability, but do not assume burst is available before `blockedUntil`.
- [x] Before making WB API request, check `blockedUntil`; if still blocked:
  - HTTP path should return "report is queued / retry later" instead of hitting WB.
  - Worker path should reschedule job after the blocked interval.
- [ ] Add structured logs around limiter decisions.

### Checkpoint

WB API calls from all backend paths share one cooldown model. A `429` in sync protects user-triggered requests, and a `429` from a user-triggered request protects sync.

### Verification

- [ ] Unit tests for `X-Ratelimit-Retry`, `X-Ratelimit-Reset`, `X-Ratelimit-Limit` parsing.
- [ ] Unit tests for blocked limiter state.
- [ ] Manual test with mocked WB `429`: second request does not call WB before `blockedUntil`.

## Phase 2 - Extract Report Artifact Lifecycle

Purpose: remove duplication between `WbReportService` and `WbSyncJob`, and create the foundation for Ozon.

### Tasks

- [ ] Introduce `ReportArtifactService` with marketplace-neutral methods:
  - `findArtifact`
  - `claimArtifact`
  - `markArtifactReady`
  - `markArtifactError`
  - `readArtifact`
  - `listArtifacts`
- [ ] Keep the existing `WbApiReport` table for this phase if needed, but hide it behind the service.
- [ ] Replace direct Prisma report mutations in `WbReportService`.
- [ ] Replace direct Prisma report mutations in `WbSyncJob`.
- [ ] Standardize artifact status handling: `queued`, `processing`, `ready`, `error` if a migration is acceptable.
- [ ] Store retry metadata: attempts, nextRunAt, lastStartedAt, lastFinishedAt.
- [ ] Store source metadata separately from response shape: endpoint, fields, external request params, row count, file hash.

### Checkpoint

There is exactly one code path responsible for claiming, storing, and updating report artifacts. WB route and WB sync job call that path instead of duplicating fetch/save logic.

### Verification

- [ ] `npm run lint`
- [ ] Unit tests for artifact claiming and status transitions.
- [ ] Manual test: cached WB report still returns same frontend payload.
- [ ] Manual test: background sync and user request do not corrupt the same artifact.

## Phase 3 - Introduce Storage Abstraction

Purpose: make report storage safe for deployments with multiple backend instances.

### Tasks

- [ ] Add `ReportStorage` interface:
  - `putJson(key, data)`
  - `getJson(key)`
  - `delete(key)`
  - `exists(key)`
  - `getMetadata(key)`
- [ ] Implement `LocalReportStorage` with current local filesystem behavior.
- [ ] Store `storageKey` instead of absolute `filePath` in new records.
- [ ] Keep compatibility read path for old `filePath` values.
- [ ] Add storage config to env:
  - `REPORT_STORAGE_DRIVER=local`
  - `REPORT_STORAGE_LOCAL_PATH`
  - future object storage variables
- [ ] Ensure writes are atomic enough for local storage: write temp file, then rename.
- [ ] Add delete/cleanup behavior for failed partial writes.

### Checkpoint

Changing storage from local filesystem to object storage becomes an implementation detail. Backend business logic no longer constructs filesystem paths directly.

### Verification

- [ ] Unit tests for local storage key generation.
- [ ] Unit tests for compatibility path resolution.
- [ ] Manual test: existing cached WB reports can still be read.
- [ ] Manual test: newly fetched reports are saved and listed with storage metadata.

## Phase 4 - Move Sync Into Durable Jobs

Purpose: decouple slow marketplace API calls from Fastify request lifecycle and support multiple backend instances.

### Tasks

- [ ] Add `ReportSyncJob` table:
  - id
  - organizationId
  - marketplace
  - reportType
  - periodFrom
  - periodTo
  - status
  - priority
  - attempts
  - nextRunAt
  - lockedBy
  - lockedUntil
  - createdByUserId
  - errorMessage
  - createdAt/updatedAt
- [ ] Add job creation for user-triggered missing reports.
- [ ] Change user endpoint behavior:
  - if all artifacts are ready, return rows as today;
  - if some artifacts are missing/queued, create jobs and return `202` with job/artifact statuses;
  - keep a compatibility path only if frontend cannot switch immediately.
- [ ] Replace in-process `WbSyncJob` loop with worker polling jobs using DB locks.
- [ ] Use `FOR UPDATE SKIP LOCKED` or advisory locks to prevent multiple workers from taking the same job.
- [ ] Add scheduled job creation for WB prefetch windows instead of doing the fetch directly inside Fastify startup.
- [ ] Add graceful worker shutdown.

### Checkpoint

Fastify can run without doing background WB API calls itself. A separate worker process can process jobs safely. Running two workers does not duplicate the same job.

### Verification

- [ ] `npm run lint`
- [ ] Unit tests for job claiming.
- [ ] Manual test: start two worker processes; one job is processed once.
- [ ] Manual test: API request for uncached period creates jobs and returns non-blocking status.
- [ ] Manual test: once jobs complete, API returns report rows from cache.

## Phase 5 - Generalize Marketplace Integrations

Purpose: make Ozon integration additive instead of another WB-shaped implementation.

### Tasks

- [ ] Define `MarketplaceAdapter` contract:
  - `marketplace`
  - `validateCredentials(credentials)`
  - `getRequiredArtifacts(periodFrom, periodTo, options)`
  - `fetchArtifact(params, credentials, rateLimiter)`
  - `normalizeArtifactPayload(payload)`
  - `getDefaultFields(reportType)`
  - `parseRateLimit(errorOrResponse)`
- [ ] Implement `WildberriesAdapter` from current WB logic.
- [ ] Move WB week calculation into `WildberriesAdapter`.
- [ ] Move WB field list into adapter-owned config.
- [ ] Update connection validation so each marketplace validates credentials via its adapter.
- [ ] Add `OzonAdapter` skeleton with credential shape and report type definitions, without implementing full ingestion yet.
- [ ] Replace route naming strategy:
  - keep old `/api/wb-finance/...` endpoints temporarily;
  - introduce `/api/marketplaces/:marketplace/reports/...` for new work.
- [ ] Document frontend migration path.

### Checkpoint

Adding Ozon requires implementing adapter methods and report mapping, not copying queue, storage, artifact lifecycle, credentials, and rate-limit logic.

### Verification

- [ ] Adapter unit tests for WB.
- [ ] Contract tests for `ReportArtifactService` using a fake adapter.
- [ ] Manual test: old WB endpoint still works.
- [ ] Manual test: generic marketplace report endpoint can route WB requests through adapter.

## Phase 6 - Improve Report Serving and Analytics Scalability

Purpose: keep API responses usable as report volume grows.

### Tasks

- [ ] Add response pagination or streaming for raw rows.
- [ ] Add endpoint to return artifact/job status separately from row payload.
- [ ] Add optional server-side field projection before loading all rows into response.
- [ ] Consider gzip compression if not already handled by deployment proxy.
- [ ] Add basic aggregate endpoints only after frontend needs are clear.
- [ ] Keep raw JSON artifacts as source of truth until aggregation requirements stabilize.
- [ ] Evaluate whether specific normalized tables are needed for high-value metrics.

### Checkpoint

The backend can serve report data without requiring a single huge in-memory response for every analytics interaction.

### Verification

- [ ] Load test with realistic multi-week report set.
- [ ] Measure memory usage during report assembly.
- [ ] Measure API latency for cached reports.
- [ ] Confirm frontend can handle paginated/status-based response flow.

## Suggested Implementation Order

1. Phase 0: correctness and small security fixes.
2. Phase 1: durable WB limiter, because WB API delay is the main operational bottleneck.
3. Phase 2: artifact lifecycle extraction.
4. Phase 3: storage abstraction.
5. Phase 4: durable job worker.
6. Phase 5: marketplace adapters and Ozon skeleton.
7. Phase 6: pagination/aggregation only after ingestion is stable.

## Rollout Strategy

- Keep existing WB endpoints during the refactor.
- Add new internals behind feature flags or config where practical.
- Migrate one behavior at a time:
  1. current route + new WB client;
  2. current route + new artifact service;
  3. current route + new storage abstraction;
  4. current route + queued ingestion;
  5. new generic marketplace route.
- Do not delete old path compatibility until existing stored reports are readable through the new storage resolver.

## Open Decisions

- Should user-triggered uncached reports block until ready, or should the frontend support `202 + polling`?
- Which object storage should production use: S3-compatible, Yandex Object Storage, or another provider?
- Should `MarketplaceConnection.status` become actively checked via adapter credential validation?
- Should report refresh be explicit user action, scheduled sync only, or both?
- How long should raw artifacts be retained?
- Should Ozon reports reuse the same user-facing analytics response format or expose marketplace-specific raw rows first?
