# Database migrations (PostgreSQL)

SQL migrations follow [golang-migrate](https://github.com/golang-migrate/migrate) naming:

- `NNNNNN_name.up.sql`
- `NNNNNN_name.down.sql`

## Run locally (Docker)

Migrations run automatically before the auth service starts (see root `docker-compose.yml`).

## Run manually

```bash
docker run --rm -v "$(pwd)/migrations/go:/migrations" migrate/migrate:v4.17.1 \
  -path=/migrations \
  -database "postgres://letsgo:letsgo@localhost:5433/letsgo?sslmode=disable" \
  up
```

## Later: AWS Cognito

When switching to Cognito for login and SSO, keep `users` for app profile data or sync from Cognito `sub`; new migrations can add `cognito_sub` and deprecate `password_hash`.
