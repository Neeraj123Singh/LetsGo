# System Overview

## Services

- **Frontend (React)**: user interface, session handling, API integration
- **Backend (Go)**: core business APIs, orchestration, event publishing
- **Analytics (Python + Lambda)**: event consumption, aggregation, analytical workloads
- **Auth (Spring Boot)**: authentication, authorization, token issuance, user identity

## Data and Search

- **PostgreSQL**: transactional and relational data
- **DynamoDB**: high-scale key-value and flexible NoSQL access patterns
- **Elasticsearch**: full-text search and filtered discovery

## Platform Components

- **Kubernetes (EKS)** for container orchestration
- **Terraform** for infrastructure as code
- **Jenkins** for CI/CD pipelines
- **Prometheus + Grafana** for metrics, dashboards, and alerts
- **OpenTelemetry** for distributed tracing

## Request and Event Flow

1. User interacts with React frontend.
2. Frontend authenticates via Auth service and receives token.
3. Frontend calls Go backend with token.
4. Backend persists transactional data in PostgreSQL and publishes domain events.
5. Analytics services and Lambda consumers process events and store derived results.
6. Searchable entities are indexed in Elasticsearch for user queries.

## Non-Functional Targets

- Availability: 99.9% for critical APIs
- p95 API latency: under 250ms for read endpoints
- Trace coverage: 90%+ of cross-service requests
- Deployment frequency: multiple times per week after stabilization
