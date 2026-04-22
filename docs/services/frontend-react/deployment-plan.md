# Frontend React Deployment Plan

## Build and Package

- Build static assets in Jenkins.
- Run tests, lint, and security checks before packaging.
- Publish image to registry if serving through containerized nginx, or publish assets to CDN bucket.

## Kubernetes Deployment

- Deploy frontend service to `frontend` namespace.
- Configure ingress and TLS.
- Set environment variables for backend/auth/search endpoints.

## Promotion Flow

- Auto deploy to dev on merge to main.
- Promote to staging after smoke tests.
- Manual approval for production.

## Runtime Operations

- Add health checks for static server.
- Configure horizontal pod autoscaling by CPU and request rate.
- Enable CDN cache control and invalidation rules if CDN-based.

## Rollback

- Roll back to previous image tag or asset release.
- Verify login and critical navigation as post-rollback checks.
