# Free-Tier Deployment Plan (Single VM)

This is the **practical $0/month** deployment path for the letsgo stack. The
aspirational AWS/EKS/Terraform/Jenkins rollout lives in
[`platform-deployment-plan.md`](./platform-deployment-plan.md) and is unchanged.

Everything in this guide stays free indefinitely as long as Oracle Cloud's
"Always Free" offering exists and you stay within its quotas.

> **Want the automated path?** Skip the click-through-the-console steps below
> and use the Terraform module + helper scripts described in
> [`../../infra/oci/README.md`](../../infra/oci/README.md). It collapses
> everything in this document into three `make` commands and is the
> recommended way to deploy. Read this document if you'd rather understand
> the underlying steps or troubleshoot the automation. Both produce the same
> running stack.

## Target architecture

```
                 ┌───────────────────────────────────────┐
                 │       Oracle Cloud Always Free VM      │
                 │       (Ampere A1 ARM, Ubuntu 22.04)    │
                 │                                        │
   Browser ──443──▶  Caddy (TLS termination, HTTP→HTTPS)  │
                 │     │                                  │
                 │     ├── / ──────────▶ frontend (nginx) │
                 │     ├── /api/* ─────▶ auth-java        │
                 │     └── /meeting/* ─▶ meeting-go ──┐   │
                 │                                    ▼   │
                 │                              postgres  │
                 │                                        │
   Browser ──3478/UDP──▶ coturn (TURN/STUN relay)         │
                 │                                        │
                 └───────────────────────────────────────┘
```

Components, all in one `docker compose` stack:

| Container    | Image                       | Purpose                                  |
| ------------ | --------------------------- | ---------------------------------------- |
| `caddy`      | `caddy:2-alpine`            | TLS, HTTP/2/3, reverse proxy             |
| `frontend`   | `letsgo-frontend` (build)   | React SPA served by nginx                |
| `auth-java`  | `letsgo-auth-java` (build)  | JWT auth, users table                    |
| `meeting-go` | `letsgo-meeting-go` (build) | WebRTC signaling, presence, invites      |
| `postgres`   | `postgres:16-alpine`        | Application database                     |
| `migrate`    | `migrate/migrate:v4.17.1`   | One-shot DB migrations                   |
| `coturn`     | `coturn/coturn:4.6`         | TURN/STUN relay for cross-NAT WebRTC     |

Public ports on the VM: **80**, **443**, **443/UDP** (HTTP/3), **3478/UDP**
(STUN+TURN), and the relay range **49160–49200/UDP**. Everything else stays on
the internal Docker network.

## Cost

| Item                 | Provider           | Cost           |
| -------------------- | ------------------ | -------------- |
| VM (4 vCPU / 24 GB)  | Oracle Cloud       | $0 (Always Free) |
| DNS                  | Cloudflare         | $0             |
| TLS certificates     | Let's Encrypt      | $0             |
| Domain name          | your registrar     | ~$2–$12 / year |
| Bandwidth            | Oracle Cloud       | 10 TB/mo free  |

A domain name is the only hard cost. `freenom`-style free domains are no longer
issued; the cheapest reliable TLDs are `.xyz` (~$2/yr) or `.dev` (~$12/yr).

## Prerequisites

- An Oracle Cloud free-tier account (https://signup.cloud.oracle.com) — credit
  card required for verification, but no charges accrue on Always Free SKUs.
- A domain you control. Cloudflare DNS works well as a free DNS host even when
  the registrar is elsewhere.
- An SSH key pair you'll use to log into the VM.

## Step 1 — Provision the VM

1. In Oracle Cloud, **Menu → Compute → Instances → Create instance**.
2. Image and shape:
   - Image: **Canonical Ubuntu 22.04** (or 24.04) — ARM build (`aarch64`).
   - Shape: **`VM.Standard.A1.Flex`** — 4 OCPUs, 24 GB memory. This is the
     largest single instance the Always Free tier allows. (If unavailable in
     your region, retry over a few days or pick a smaller A1 shape.)
3. Networking:
   - Public IPv4 — **assign**.
   - VCN/subnet — use the auto-created default if you have no existing one.
4. SSH keys — upload your public key.
5. **Create**.

After 2–3 minutes, copy the **Public IPv4 address** from the instance detail
page. This is the value for `TURN_EXTERNAL_IP` later.

## Step 2 — Open firewall ports

Oracle Cloud blocks all inbound traffic by default at two layers.

### 2a. VCN Security List (network-level)

**Networking → Virtual Cloud Networks → your VCN → default Security List →
Add Ingress Rules**:

| Source | Protocol | Port range  | Description           |
| ------ | -------- | ----------- | --------------------- |
| 0.0.0.0/0 | TCP   | 80          | HTTP (redirect → 443) |
| 0.0.0.0/0 | TCP   | 443         | HTTPS                 |
| 0.0.0.0/0 | UDP   | 443         | HTTP/3 (QUIC)         |
| 0.0.0.0/0 | UDP   | 3478        | STUN + TURN/UDP       |
| 0.0.0.0/0 | UDP   | 49160-49200 | TURN media relay      |

### 2b. iptables on the VM (host-level)

Ubuntu cloud images ship with `iptables` rules that drop most inbound traffic.
After the first SSH login, run:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT 1 -p udp --dport 443  -j ACCEPT
sudo iptables -I INPUT 1 -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 1 -p udp --dport 49160:49200 -j ACCEPT

sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

## Step 3 — Point DNS at the VM

In your DNS provider (Cloudflare recommended):

| Type | Name    | Value                  | Proxy        |
| ---- | ------- | ---------------------- | ------------ |
| `A`  | `letsgo` (or `@`) | `<VM public IPv4>` | **DNS only** |

> **Important:** Disable Cloudflare's orange-cloud proxy for this record (set
> it to "DNS only"). Cloudflare's proxy mode strips UDP and disrupts both
> WebSocket signaling and TURN media. Run "DNS only" until you're comfortable
> tuning Cloudflare's WebSockets/Spectrum features.

Verify with:

```bash
dig +short letsgo.example.com
```

The IPv4 must match before Caddy can obtain a Let's Encrypt cert.

## Step 4 — Bootstrap the VM

SSH in as `ubuntu`:

```bash
ssh ubuntu@<VM public IPv4>
```

Install Docker Engine + Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
exec sg docker newgrp $(id -gn)   # re-evaluate group membership without logout
```

Sanity check:

```bash
docker run --rm hello-world
docker compose version
```

## Step 5 — Clone and configure the repo

```bash
cd ~
git clone https://github.com/<you>/letsgo.git
cd letsgo
cp .env.prod.example .env.prod
```

Generate strong secrets and fill in `.env.prod`:

```bash
# Print suggested values; copy into .env.prod
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "LETSGO_JWT_SECRET=$(openssl rand -base64 48)"
echo "TURN_PASS=$(openssl rand -hex 16)"
echo "TURN_EXTERNAL_IP=$(curl -4 -s ifconfig.me)"
```

Edit `.env.prod` and set:

```
DOMAIN=letsgo.example.com
ACME_EMAIL=you@example.com
POSTGRES_PASSWORD=<from above>
LETSGO_JWT_SECRET=<from above>
TURN_USER=letsgo
TURN_PASS=<from above>
TURN_EXTERNAL_IP=<from above>
```

## Step 6 — Build and launch

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

First boot takes 5–10 minutes (Maven, npm, Go builds). Watch progress:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f --tail=50
```

What to look for:

- `caddy` — `certificate obtained successfully` (after ~30 s)
- `migrate` — exits with code 0
- `auth-java` — `Started AuthApplication`
- `meeting-go` — `listening on :8081`
- `coturn` — `Total Servers: ... [1] Domain name:`

## Step 7 — Verify

```bash
# Frontend
curl -sI https://letsgo.example.com | head -1
# → HTTP/2 200

# Auth health
curl -sI https://letsgo.example.com/api/auth/login -X OPTIONS | head -1
# → HTTP/2 204

# Meeting WS (handshake will fail without a token, but the upgrade should attempt)
curl -sI -H "Upgrade: websocket" -H "Connection: Upgrade" \
     https://letsgo.example.com/meeting/ws/v1/notify | head -3

# TURN reachability from your laptop (not the VM)
turnutils_uclient -u letsgo -w <TURN_PASS> letsgo.example.com
# → "0: peer relay address..."
```

Then open `https://letsgo.example.com` in a browser, sign up two accounts on
two different networks (one on cellular if you can), and confirm a video call
connects. The browser's `chrome://webrtc-internals` will show
`relay` candidates if TURN is actually in use.

## Operations

### Updating after a `git pull`

```bash
cd ~/letsgo
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

The `migrate` container is rerun automatically — `golang-migrate` is idempotent.

### Rotating a TURN password

```bash
# 1. Pick a new password
NEW_PASS=$(openssl rand -hex 16)
# 2. Update .env.prod (TURN_PASS=$NEW_PASS) then:
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d \
    --build --force-recreate frontend coturn
```

The frontend bundle has the TURN credentials baked in at build time, so it
**must** be rebuilt whenever the password changes.

### Rotating the JWT secret

```bash
# Update LETSGO_JWT_SECRET in .env.prod, then:
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d \
    --build --force-recreate auth-java meeting-go
```

All existing tokens become invalid; users will be signed out.

### Backups

```bash
# On-VM nightly cron entry — dumps to a timestamped file in ~/backups
0 3 * * * cd ~/letsgo && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U letsgo letsgo | gzip > ~/backups/letsgo-$(date +\%Y\%m\%d).sql.gz
```

Sync the `~/backups` directory to a free B2 or R2 bucket weekly for an
off-host copy.

### Renewals

Caddy renews Let's Encrypt certificates automatically. There is nothing to
schedule. The `caddy_data` named volume persists the ACME account; do not
delete it casually.

## Security checklist

- [ ] `.env.prod` is in `.gitignore` (already configured)
- [ ] `POSTGRES_PASSWORD`, `LETSGO_JWT_SECRET`, `TURN_PASS` are each ≥ 24
      random bytes
- [ ] No Postgres host port exposed (only reachable on the internal Docker
      network — see `docker-compose.prod.yml`)
- [ ] coturn `denied-peer-ip` rules block RFC1918 ranges (already configured
      in `coturn/turnserver.conf`)
- [ ] iptables persists across reboot (`netfilter-persistent save`)
- [ ] Cloudflare DNS record is "DNS only", not proxied
- [ ] After the first 60 days of stable cert renewal, uncomment the HSTS
      header in `Caddyfile`

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `caddy` keeps retrying `tls-alpn-01`      | Port 80/443 not open (check both VCN Security List and iptables)                         |
| Browser says `ERR_CONNECTION_REFUSED`     | Same as above, or domain DNS still pointing at the old IP                                |
| TLS warning page in browser               | DNS A record not yet propagated when Caddy first ran — `docker compose restart caddy`    |
| WebSocket disconnects every minute        | Cloudflare proxy is enabled — set the A record to "DNS only"                             |
| Video tile blank cross-network            | TURN candidates missing — verify `TURN_EXTERNAL_IP` matches `curl -4 ifconfig.me`        |
| `coturn` exits with "Cannot bind address" | Another process bound `3478/udp` — `sudo lsof -iUDP:3478`                                |
| Frontend doesn't pick up new TURN creds   | Old image cached — `docker compose ... up -d --build --force-recreate frontend`          |
| Migration fails: relation already exists  | DB was migrated outside compose — drop the volume `postgres_data` if you can lose data   |

## Migration to the AWS plan

When you outgrow the single-VM setup, the migration path is straightforward:

1. Stand up RDS Postgres alongside the VM and `pg_dump | psql` over.
2. Push the same container images to ECR.
3. Deploy them to EKS via the manifests/Helm charts described in
   [`platform-deployment-plan.md`](./platform-deployment-plan.md).
4. Switch DNS, drain WebSocket connections, decommission the VM.

The application code, env-var contracts, and migration scripts do not change.
