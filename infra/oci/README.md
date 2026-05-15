# Oracle Cloud Always-Free deployment (automated)

Terraform module + cloud-init + helper scripts that take you from "nothing" to
"the app is live on `https://your.domain`" in roughly **15 minutes of wall time
and three commands of yours**.

Everything is free-tier:

| Layer            | Provider                       | Cost     |
| ---------------- | ------------------------------ | -------- |
| VM (4 OCPU, 24G) | Oracle Cloud Always Free       | $0       |
| Disk (200 GB)    | Oracle Cloud Always Free       | $0       |
| Bandwidth        | 10 TB/mo egress on OCI         | $0       |
| TLS              | Let's Encrypt via Caddy        | $0       |
| TURN             | Self-hosted coturn on same VM  | $0       |
| DNS              | Cloudflare / your registrar    | $0       |

---

## Architecture

```
                          your.domain  ─►  Cloudflare DNS
                                              │ (A record)
                                              ▼
   ┌──────────────────────  Oracle Cloud A1.Flex VM  ──────────────────────┐
   │                                                                       │
   │   Caddy  ──►  frontend (nginx + React bundle)                         │
   │     │    └─►  auth-java     (/api/*)                                  │
   │     │    └─►  meeting-go    (/meeting/*  +  WebSocket /meeting/ws/)   │
   │     ▼                                                                 │
   │   :443 / :80                                                          │
   │                                                                       │
   │   coturn  ──►  :3478/udp (STUN+TURN) + 49160-49200/udp (media relay)  │
   │                                                                       │
   │   Postgres (internal only, on letsgo_internal docker network)         │
   └───────────────────────────────────────────────────────────────────────┘
```

Caddy terminates TLS, reverse-proxies the three app services, and renews
certificates automatically. coturn lets browsers behind symmetric NAT relay
their media through your VM.

---

## What this module creates

Everything is built fresh inside its own VCN so you can `terraform destroy`
without touching anything else in your tenancy.

* **`oci_core_vcn`** — `10.0.0.0/16`
* **`oci_core_internet_gateway`** + **`oci_core_route_table`**
* **`oci_core_security_list`** with rules for:
  * TCP 22 (SSH — tighten via `ssh_ingress_cidr`)
  * TCP 80, 443
  * UDP 443 (HTTP/3 / QUIC)
  * UDP 3478 (STUN + TURN)
  * UDP 49160–49200 (TURN media relay range)
* **`oci_core_subnet`** — `10.0.0.0/24`, public
* **`oci_core_instance`** — `VM.Standard.A1.Flex`, 4 OCPU / 24 GB by default,
  latest Ubuntu 22.04 ARM image, public IP, SSH key from `~/.ssh/...`
* `user_data` runs `cloud-init.yaml` on first boot to install Docker,
  configure persistent iptables, and clone your repo into `/home/ubuntu/letsgo`.

---

## Prerequisites (one-time)

1. **Oracle Cloud account.** Sign up at <https://www.oracle.com/cloud/free/>.
   Verify a payment method (no charges on the free tier) and complete the
   email verification.
2. **Terraform ≥ 1.5** locally:
   ```
   brew install terraform     # macOS
   # or download from https://developer.hashicorp.com/terraform/downloads
   ```
3. **OCI CLI configured.** This is how Terraform authenticates without any
   secrets living in this repo:
   ```
   brew install oci-cli
   oci setup config
   ```
   Accept the defaults; it writes `~/.oci/config` and uploads your public key
   to your OCI user.
4. **SSH key.** If you don't already have one:
   ```
   ssh-keygen -t ed25519 -C "letsgo"
   ```
5. **Public Git URL** for this repo (HTTPS). If the repo is private, see
   *Private repo* below.
6. **A domain name** with the ability to set an A record (any registrar works;
   Cloudflare is recommended for free DNS + DDoS).

---

## Three-command deploy

### 1. Configure

```bash
cd infra/oci
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars     # fill in tenancy OCID, region, repo URL, etc.
```

### 2. Provision the VM

From the repo root:

```bash
make tf-init        # downloads the oracle/oci provider (once)
make tf-apply       # creates VCN, subnet, security list, and the VM
make wait           # blocks until SSH + cloud-init finish (≈3 min)
```

`make tf-apply` prints the VM's public IP. **Create your DNS A record now**
pointing `your.domain` at that IP. Caddy needs DNS to resolve correctly
before it can issue a Let's Encrypt cert.

### 3. Generate secrets and deploy the stack

```bash
make remote-setup
```

This SSHes into the VM, runs `scripts/setup.sh` interactively (asks for your
domain, email, and confirms the VM's public IP), generates a `.env.prod` with
strong random secrets, then brings the stack up.

After ~30 s Caddy obtains a Let's Encrypt cert and the app is live at
`https://your.domain`.

---

## Day-2 operations

All `make` targets are documented inline — run `make help` for the full list.

| Task                                | Command                                              |
| ----------------------------------- | ---------------------------------------------------- |
| Print VM's public IP                | `make ip`                                            |
| SSH into the VM                     | `make ssh`                                           |
| Tail logs (from your laptop)        | `make remote-logs`                                   |
| Tail one service (from on the VM)   | `bash scripts/logs.sh meeting-go`                    |
| Pull latest code + redeploy         | `make remote-deploy`                                 |
| Stop the stack (keep data)          | `make remote-down`                                   |
| Restart one service (on the VM)     | `make restart SERVICE=auth-java`                     |
| Destroy the VM and free resources   | `make tf-destroy`                                    |

### Rotate a secret

Edit `/home/ubuntu/letsgo/.env.prod` on the VM, then:

```bash
ssh ubuntu@$(make -s ip)
cd letsgo
bash scripts/deploy.sh
```

### Back up Postgres

The database volume is `letsgo_postgres_data` on the VM. Quick logical dump:

```bash
ssh ubuntu@$(make -s ip) "docker exec letsgo-postgres-1 pg_dump -U letsgo letsgo" \
  | gzip > backups/letsgo-$(date +%F).sql.gz
```

---

## Private repo

If you'd rather not make the source public:

* **Easy:** create a [GitHub personal access token](https://github.com/settings/tokens)
  with `repo` scope and use a tokenised clone URL in `terraform.tfvars`:
  ```
  git_repo_url = "https://USERNAME:TOKEN@github.com/USERNAME/letsgo.git"
  ```
  ⚠ This puts the token in your local Terraform state. State is gitignored, but
  treat the `infra/oci/` folder like a secret directory.
* **Better:** keep `git_repo_url` empty and `scp` the source up after
  `make wait`, then run `make remote-setup`.
* **Best:** publish images to GHCR from CI and ship a `compose.prod.yml`
  that only references images, not build contexts. See the comment at the top
  of `docker-compose.prod.yml`.

---

## Troubleshooting

| Symptom                                                  | Fix                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Out of host capacity` from `terraform apply`            | OCI throttles new A1 instances. Retry every few hours, or change `region`.           |
| `cloud-init status --wait` errors during `make wait`     | SSH in and `sudo cat /var/log/cloud-init-output.log`. Usually a transient apt error. |
| Caddy logs: `acme: error: ... no such host`              | DNS A record isn't propagated yet. Wait, then `make restart SERVICE=caddy`.          |
| WebRTC works on LAN but not over the internet            | Confirm UDP 3478 + 49160–49200 are open in the OCI security list AND the host iptables. |
| `port 5432 already allocated` in compose                 | Something on the VM is already using 5432 — production stack only exposes 80/443/3478/relay, so this only happens if you ran the dev stack by accident. |

For deeper guidance see [`docs/platform/free-tier-deployment.md`](../../docs/platform/free-tier-deployment.md).
