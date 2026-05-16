# HTTPS, TLS, and certificates

How TLS is handled **today** in Letsgo: **public HTTPS at the edge** in production only; **plain HTTP** on the Docker bridge inside the VM; **no TLS** between app containers and Postgres by default.

---

## Production (single VM): Caddy + Let’s Encrypt

### Who terminates TLS?

**[Caddy](https://caddyserver.com/)** (`caddy:2-alpine` in **`docker-compose.prod.yml`**) listens on **80** and **443** (and **443/UDP** for HTTP/3). It terminates HTTPS for browsers and obtains **public certificates from Let’s Encrypt** using the **ACME HTTP-01** challenge (Caddy’s default automation).

### Files involved

| File | Role |
|------|------|
| **`docker-compose.prod.yml`** | Runs Caddy with ports **80**, **443**, **443/udp**; mounts **`Caddyfile`**; persists **`caddy_data`** (certificates + ACME account material) and **`caddy_config`** |
| **`Caddyfile`** | Site block **`{$DOMAIN}`** — enables managed HTTPS; **`reverse_proxy`** to **`frontend`**, **`auth-java`**, **`meeting-go`**; optional security headers |
| **`.env.prod`** | **`DOMAIN`** — hostname on the certificate (DNS **A** record must point at the VM **before** first successful issuance); **`ACME_EMAIL`** — contact address for Let’s Encrypt expiry notices (wired into the Caddy container via Compose) |

### Prerequisites for a valid certificate

1. **`DOMAIN`** is a hostname that resolves to this VM’s **public IPv4**.
2. **TCP 80** and **TCP 443** reach Caddy (Terraform security groups open these).
3. First **`docker compose … up`** for prod runs while DNS is correct — Let’s Encrypt will hit **`http://<DOMAIN>/.well-known/acme-challenge/...`** on port 80.

If issuance fails, check DNS propagation, firewall/SG rules, and Caddy logs:  
`docker compose --env-file .env.prod -f docker-compose.prod.yml logs caddy`

### Renewal and storage

- **Renewal**: Caddy renews certificates automatically before expiry (typically Let’s Encrypt ~90‑day certs).
- **Storage**: Certificate data lives in the **`caddy_data`** Docker volume (`/data` inside the container), **not** in git. Recreating the volume forces **new** issuance (still allowed within Let’s Encrypt rate limits if not abused).

### Global TLS options (email)

The **`Caddyfile`** global block sets:

```12:12:Caddyfile
	email {$ACME_EMAIL:admin@example.com}
```

Use a **real address** in **`.env.prod`** (`ACME_EMAIL`) so you receive expiry / policy emails.

### Headers and HSTS

The **`Caddyfile`** adds **`X-Content-Type-Options`**, **`Referrer-Policy`**, **`Permissions-Policy`**, strips **`Server`**, and keeps **`Strict-Transport-Security` commented out** until DNS and renewal are stable — then you can enable HSTS deliberately.

### Backend trust chain

From the browser:

| Hop | Encryption |
|-----|------------|
| Browser ↔ **Caddy** | **TLS** (Let’s Encrypt) |
| **Caddy** ↔ **frontend** (nginx :80) | **HTTP on Docker network** (private bridge) |
| **Caddy** ↔ **auth-java** / **meeting-go** | **HTTP on Docker network** |

That pattern (“TLS only at the edge”) is normal for Compose-on-one-host setups.

### CORS and canonical origin

**`auth-java`** and **`meeting-go`** use **`https://${DOMAIN}`** for **`LETSGO_CORS_ALLOWED_ORIGINS`** / **`CORS_ALLOWED_ORIGINS`** in **`docker-compose.prod.yml`**, so the SPA must be loaded from **`https://<DOMAIN>`**, not bare IP (unless you change CORS and certificate strategy).

---

## Development / CI: no edge TLS

**`docker-compose.yml`** publishes **frontend** on **`localhost:${FRONTEND_HOST_PORT:-3000}`** as **plain HTTP**. **`frontend/nginx.conf`** listens on **port 80** only.

**`auth-java`** and **`meeting-go`** allow **`http://localhost:3000`** and **`http://localhost:5173`** (Vite dev server) via **`LETSGO_CORS_ALLOWED_ORIGINS`** / **`CORS_ALLOWED_ORIGINS`**.

GitHub Actions (**`.github/workflows/ci.yml`**) hits **`http://localhost:3000`** for Selenium — same model.

---

## PostgreSQL `sslmode=disable`

Connection URLs use **`sslmode=disable`** — traffic between JVM/Go apps and Postgres stays **inside the Docker network**, not exposed publicly. That is **not** browser HTTPS; enabling Postgres TLS would require server certs and JDBC/Go SSL settings (not configured today).

---

## Coturn (WebRTC TURN)

**`coturn`** is configured for **UDP/TURN on 3478** with long‑term credentials; **`coturn/turnserver.conf`** notes optional **TLS on 5349** (`tls-listening-port` + cert paths). The default prod **`docker-compose.prod.yml`** command does **not** enable TURN-over-TLS on 5349 — browsers talk **TLS to your site via Caddy**, and **UDP** (and optionally TCP 3478) to coturn for relay.

---

## Pros and cons (this setup)

| Pros | Cons |
|------|------|
| **Automatic** issuance and renewal via Caddy; no manual cert tooling | **Single-host** deployment — losing the VM/volume needs rebuild + ACME retry discipline |
| **Free** public certs from Let’s Encrypt | Must keep **80/443** correct for renewal; DNS mistakes break issuance |
| Simple ops: one **`Caddyfile`**, two volumes | **No TLS** app→Postgres (acceptable on private bridge; not for regulated “encryption in transit end‑to‑end”) |
| HTTP/3 enabled on **443/udp** | Staging **exact** prod TLS locally is awkward — use a real staging hostname or mkcert |

---

## Related docs

- **`docs/deployment-current.md`** — Terraform + Compose deploy flow  
- **`infra/aws/README.md`** / **`infra/oci/README.md`** — opening ports 80/443 on the VM  
