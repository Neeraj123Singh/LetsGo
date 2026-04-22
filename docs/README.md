# Microservices Platform Documentation

This folder contains section-wise documentation for a 4-service architecture:

1. Frontend UI in React
2. Backend API in Go
3. Analytics and messaging in Python and AWS Lambda
4. Auth service in Java Spring Boot

It also includes platform plans for Kubernetes, Terraform, Jenkins CI/CD, observability, and data systems.

## Document Map

- `product-overview.md` - business and product-level overview, personas, and goals
- `architecture/system-overview.md` - end-to-end architecture and technology choices
- `monorepo-split/repo-strategy.md` - how to structure now and split into separate repos later
- `platform/platform-deployment-plan.md` - shared infrastructure and rollout plan
- `video-meeting-app/README.md` - design package for video meeting product use case
- `video-meeting-app/entity-diagram.md` - ER diagram for core relational entities
- `video-meeting-app/postgres-schema.md` - PostgreSQL schema and indexing strategy
- `video-meeting-app/dynamodb-schema.md` - DynamoDB table design for chat/presence/signaling
- `video-meeting-app/system-design.md` - end-to-end service design and runtime topology
- `video-meeting-app/data-flow-diagram.md` - data flow across services and stores
- `video-meeting-app/sequence-diagram.md` - request/response and realtime sequences
- `services/frontend-react/development-plan.md`
- `services/frontend-react/deployment-plan.md`
- `services/backend-go/development-plan.md`
- `services/backend-go/deployment-plan.md`
- `services/analytics-python/development-plan.md`
- `services/analytics-python/deployment-plan.md`
- `services/auth-springboot/development-plan.md`
- `services/auth-springboot/deployment-plan.md`

## Recommended Starting Order

1. Read `architecture/system-overview.md`
2. Finalize `monorepo-split/repo-strategy.md`
3. Execute `platform/platform-deployment-plan.md` foundation items
4. Build one vertical slice across all 4 services
