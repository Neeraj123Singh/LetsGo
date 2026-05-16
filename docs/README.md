# Documentation index

Documentation for the **Letsgo** monorepo: a React SPA, **Spring Boot** auth service, **Go** meeting/signaling service, and **PostgreSQL** (see root **`README.md`** for run/test/deploy).

## Start here

- **`README.md`** (repository root) — run locally, architecture, CI, deployment
- **`docs/engineering-tradeoffs.md`** — technical pros/cons and performance ideas
- **`docs/architecture/system-overview.md`** — services and data flow (implemented vs forward-looking)

## Product & design

- **`docs/product-overview.md`** — product framing
- **`docs/video-meeting-app/README.md`** — video/call product design notes (**Postgres + mesh** today; SFU/Dynamo-style items are aspirational unless labeled)
- **`docs/video-meeting-app/postgres-schema.md`** — relational notes + pointer to **`migrations/go/`** as **source of truth**
- **`docs/video-meeting-app/system-design.md`**, **`data-flow-diagram.md`**, **`sequence-diagram.md`**, **`entity-diagram.md`** — diagrams (interpret with prototype vs target callouts in each file)

## Per-service planning (historical / planning)

- **`docs/services/auth-springboot/`** — auth service plans
- **`docs/services/backend-go/`** — Go service plans (aligned with `meeting-go`)
- **`docs/services/frontend-react/`** — frontend plans

## Platform & deploy

- **`docs/platform/free-tier-deployment.md`** — Oracle-style free tier (similar patterns apply to single-VM AWS)
- **`docs/platform/platform-deployment-plan.md`** — broader platform rollout notes
- **`infra/aws/README.md`**, **`infra/oci/README.md`** — Terraform instructions

## Monorepo

- **`docs/monorepo-split/repo-strategy.md`** — optional future repo split

## Change log

- **`docs/changes/README.md`** — index of dated session notes
- **`docs/changes/2026-05-04.md`** — example slice (auth + meeting + mesh)

## Removed / obsolete doc locations

- **`docs/video-meeting-app/dynamodb-schema.md`** — **removed**; this repo does not use DynamoDB for the runnable stack.
- **`docs/services/analytics-python/`** — **removed**; no Python analytics service in this codebase.
