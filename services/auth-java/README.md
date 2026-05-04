# Auth service (Spring Boot)

Email/password authentication backed by PostgreSQL. Issues JWT access tokens for the React app.

## Endpoints

- `POST /api/auth/register` — body: `{ "email", "password", "displayName" }`
- `POST /api/auth/login` — body: `{ "email", "password" }`
- `GET /api/users/me` — `Authorization: Bearer <token>`

## Video / meetings

WebRTC signaling, rooms, and “who is online” for meetings live in **`services/meeting-go`** (Go), not in this service. The UI calls `/meeting/...` through the same nginx gateway used in Docker.

## Configuration

See `src/main/resources/application.yml`. Important environment variables:

- `LETSGO_JWT_SECRET` — at least 32 UTF-8 bytes for HS256 (must match `meeting-go`)
- `LETSGO_CORS_ALLOWED_ORIGINS` — comma-separated list for browser clients hitting the API directly
- `SPRING_DATASOURCE_*` — JDBC settings

## Database schema

Managed by SQL migrations in `migrations/go/` at repo root (golang-migrate). Hibernate `ddl-auto` is `validate`.

## Later: AWS Cognito

Plan to replace password verification with Cognito tokens or add Cognito as an IdP while keeping `users` for app-specific profile fields.
