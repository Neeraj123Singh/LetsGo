# Backend Go Development Plan

## Scope

Build the core business API service with transactional workflows, event publication, and search indexing hooks.

**Related in this monorepo:** real-time **meeting signaling** is implemented separately in **`services/meeting-go/`** (room + notify WebSockets, user lookup). When the platform “backend-go” service exists, decide whether meeting signaling remains its own deployable or merges behind one ingress path; see `docs/changes/2026-05-04.md`.

## Milestones

1. Scaffold service, config system, and API framework.
2. Implement auth middleware and role-based authorization checks.
3. Build domain APIs with PostgreSQL persistence.
4. Publish domain events for analytics and asynchronous processing.
5. Integrate Elasticsearch indexing updates.

## Engineering Tasks

- Define OpenAPI contract and generate client/server artifacts where useful.
- Add database migration pipeline.
- Implement repository and service layers with clear interfaces.
- Add idempotency and retry handling for message publication.
- Add metrics, traces, and structured logs.

## Quality Gates

- Unit tests for business logic and repositories
- Integration tests with PostgreSQL and message broker
- Contract tests for API schema
- Performance checks on key endpoints

## Risks and Mitigations

- Data consistency between DB and events -> transactional outbox pattern
- Query performance regressions -> profiling and indexed schema design
