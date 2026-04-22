# Backend Go Deployment Plan

## Build and Artifact

- Build statically linked Go binary in Jenkins.
- Run unit, integration, lint, and vulnerability scans.
- Build and push container image with immutable tag.

## Kubernetes Deployment

- Deploy to `backend` namespace with ConfigMaps and Secrets.
- Configure readiness and liveness probes.
- Attach service account with minimum IAM permissions.

## Data Dependencies

- Apply PostgreSQL migrations before app rollout.
- Validate message broker/topic access and Elasticsearch connectivity.

## Promotion Flow

- Dev auto deploy with smoke tests.
- Staging load and integration tests.
- Production deploy with progressive rollout and alert watch window.

## Rollback

- Revert deployment to prior stable image.
- For incompatible schema changes, require backward-compatible migration strategy.
