# Analytics Python Deployment Plan

## Build and Package

- Build Python worker image and Lambda packages in Jenkins.
- Execute tests, linting, and security scanning.
- Version and publish artifacts.

## Kubernetes and Lambda Deployment

- Deploy long-running workers to `analytics` namespace in Kubernetes.
- Deploy Lambda handlers through Terraform modules.
- Configure event source mappings and dead-letter queues.

## Data and Runtime Config

- Inject table names, stream ARNs, and feature flags via environment config.
- Configure autoscaling for workers based on queue depth or lag.

## Promotion Flow

- Deploy to dev with synthetic events.
- Validate staging with replay test data.
- Promote to production with progressive traffic/event enablement.

## Rollback

- Revert worker image or Lambda alias to prior version.
- Pause problematic event subscriptions while investigating.
