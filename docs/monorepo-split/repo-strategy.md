# Repo Strategy: Platform Monorepo to Service Repos

## Goal

Start with a single platform repository for fast cross-service integration, then split into separate service repositories when team ownership and release cadence grow.

## Initial Platform Monorepo Layout

```text
/
  docs/
  frontend/
  services/
    backend-go/
    analytics-python/
    auth-springboot/
  infra/
    terraform/
    k8s/
    jenkins/
  observability/
```

## Split Plan (Future State)

Create these repositories:

- `platform-infra` (Terraform, shared K8s base, Jenkins shared libs, observability assets)
- `frontend-react`
- `backend-go`
- `analytics-python`
- `auth-springboot`

## Shared Standards Across Repos

- Semantic versioning and release tags
- OpenAPI and AsyncAPI event schema versioning
- Branch protections and required CI checks
- Security scanning and dependency policy
- Common SLOs and alert labels

## Migration Steps

1. Lock interface contracts (APIs and events) in the monorepo.
2. Move each service directory into its own repository while preserving git history.
3. Keep deployment manifests in either service repos or `platform-infra` by ownership model.
4. Update Jenkins multibranch jobs per new repository.
5. Add integration test job that checks all services together nightly.

## Pros and Cons of Splitting

### Pros

- Independent release cycles and permissions
- Smaller CI scope per change
- Clear team ownership

### Cons

- Harder cross-repo refactors
- More coordination overhead for interface changes
- Additional governance needed for consistent quality gates
