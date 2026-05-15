# AWS free-tier deployment

Terraform module + cloud-init that brings up the same single-VM letsgo stack
on AWS that the [`infra/oci`](../oci) module does on Oracle Cloud. After the
VM is provisioned, all the existing helper scripts (`scripts/setup.sh`,
`scripts/deploy.sh`, etc.) and `make remote-*` targets work unchanged.

---

## Read this first — free-tier RAM is tight

| Layer | AWS free tier (12 months) | OCI Always Free (forever) |
| --- | --- | --- |
| vCPU | 1 (`t3.micro`) | **4** (`A1.Flex`) |
| RAM | **1 GB** | **24 GB** |
| Disk | 30 GB EBS | 200 GB |
| Cost after free period | ~$8–18/mo | $0 forever |

This stack runs a JVM (Spring Boot auth), Postgres, Caddy, nginx, a Go service
and coturn together. **1 GB of RAM is not really enough.** The module adds a
2 GB swap file in cloud-init to keep things from OOM-killing, but expect:

- Very slow first build (~15–25 min) because Maven/npm/Go all swap heavily.
- Occasional latency spikes under load.
- Risk of OOM during simultaneous user load + a redeploy.

**Recommended:**

- Just trying it out → keep the default `t3.micro` and accept the slowness.
- Anything resembling real use → set `instance_type = "t3.small"` (~$15/mo,
  2 GB) or `t4g.small` (~$12/mo, ARM, 2 GB).
- If forever-free matters more than AWS specifically → use
  [`infra/oci`](../oci) instead. It's the same UX, no time limit, 24 GB RAM.

---

## Architecture

```
                          your.domain  ─►  DNS provider
                                              │ (A record)
                                              ▼
   ┌────────────────────  AWS EC2 (Ubuntu 22.04)  ───────────────────────┐
   │                                                                     │
   │   Caddy  ──►  frontend (nginx + React bundle)                       │
   │     │    └─►  auth-java     (/api/*)                                │
   │     │    └─►  meeting-go    (/meeting/*  +  WebSocket /meeting/ws/) │
   │     ▼                                                               │
   │   :443 / :80                                                        │
   │                                                                     │
   │   coturn  ──►  :3478/udp (STUN+TURN) + 49160-49200/udp (relay)      │
   │                                                                     │
   │   Postgres (internal only, on letsgo_internal docker network)       │
   └─────────────────────────────────────────────────────────────────────┘
```

## What this module creates

Everything lives inside its own VPC so `terraform destroy` won't touch
anything else in your account.

* **`aws_vpc`** — `10.0.0.0/16`
* **`aws_internet_gateway`** + **`aws_route_table`** (+ association)
* **`aws_subnet`** — `10.0.0.0/24`, public (auto-assign public IP)
* **`aws_security_group`** with rules for:
  * TCP 22 (SSH — tighten via `ssh_ingress_cidr`)
  * TCP 80, 443
  * UDP 443 (HTTP/3 / QUIC)
  * UDP 3478 (STUN + TURN)
  * UDP 49160–49200 (TURN media relay range)
* **`aws_key_pair`** — uploads your public key
* **`aws_instance`** — `t3.micro` by default (override via `instance_type`),
  latest Canonical Ubuntu 22.04 AMI matching the instance's architecture
* **`aws_eip`** — Elastic IP associated to the instance so the public address
  is stable across stop/start (free while attached)
* `user_data` runs [`cloud-init.yaml`](./cloud-init.yaml) on first boot to
  install Docker, optionally create a swap file, and clone your repo into
  `/home/ubuntu/letsgo`.

AWS handles inbound filtering at the security group, so unlike the OCI image
there are no host iptables rules to manage.

---

## Prerequisites (one-time)

1. **AWS account** with free tier active. Sign in at <https://console.aws.amazon.com>.
2. **Terraform ≥ 1.5** locally:
   ```bash
   brew install terraform   # macOS
   ```
3. **AWS CLI configured.** This is how Terraform authenticates without any
   secrets in this repo:
   ```bash
   brew install awscli
   aws configure
   ```
   It will ask for an Access Key ID + Secret Access Key. Create those in the
   AWS console: **IAM → Users → your user → Security credentials → Create
   access key → CLI**. Paste them in along with your region.

   Sanity check:
   ```bash
   aws sts get-caller-identity     # should print your account ID
   ```
4. **SSH key.** If you don't already have one:
   ```bash
   ssh-keygen -t ed25519 -C "letsgo"
   ```
5. **Public Git URL** for this repo (HTTPS). Private-repo workarounds in
   [`../oci/README.md`](../oci/README.md#private-repo) apply here too.
6. **A hostname** with the ability to set an A record. If you don't have a
   domain, **DuckDNS** (`yourname.duckdns.org`) and **sslip.io**
   (`<ip-with-dashes>.sslip.io`) both work end-to-end including HTTPS.

---

## Three-command deploy

### 1. Configure

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars     # fill in region, repo URL, etc.
```

### 2. Provision the VM

From the repo root:

```bash
CLOUD=aws make tf-init       # downloads the hashicorp/aws provider (once)
CLOUD=aws make tf-apply      # creates VPC, subnet, SG, EC2 instance, EIP
CLOUD=aws make wait          # blocks until SSH + cloud-init finish (~3–5 min)
```

`make tf-apply` prints the EIP. **Create your DNS A record now** pointing
`your.domain` at that IP. Caddy needs DNS to resolve before it can issue a
Let's Encrypt cert.

### 3. Generate secrets and deploy the stack

```bash
CLOUD=aws make remote-setup
```

This SSHes into the VM, runs `scripts/setup.sh` interactively (asks for your
domain, email, and confirms the VM's public IP), generates `.env.prod` with
strong random secrets, then brings the stack up.

On `t3.micro` the first build takes 15–25 minutes (Maven + npm + Go all
swapping). On `t3.small` it's more like 7–10 minutes.

After ~30 s Caddy obtains a Let's Encrypt cert and the app is live at
`https://your.domain`.

---

## Day-2 operations

| Task | Command |
| --- | --- |
| Print VM's public IP | `CLOUD=aws make ip` |
| SSH into the VM | `CLOUD=aws make ssh` |
| Tail logs (from your laptop) | `CLOUD=aws make remote-logs` |
| Pull latest code + redeploy | `CLOUD=aws make remote-deploy` |
| Stop the stack (keep data) | `CLOUD=aws make remote-down` |
| Destroy the VM and free resources | `CLOUD=aws make tf-destroy` |

> Tip: `export CLOUD=aws` in your shell so you don't have to prefix every
> command.

### Rotating a secret

Edit `/home/ubuntu/letsgo/.env.prod` on the VM, then:

```bash
ssh ubuntu@$(CLOUD=aws make -s ip)
cd letsgo
bash scripts/deploy.sh
```

### Resizing the instance

You can change `instance_type` in `terraform.tfvars` and re-apply:

```bash
CLOUD=aws make tf-apply
```

Terraform will stop the instance, change its type, and start it again. The
EIP, EBS root volume, and Docker named volumes survive — your data and TLS
certs are preserved. Downtime is ~1 minute.

> If you switch between x86_64 (`t3.*`) and ARM (`t4g.*`), Terraform will
> need to recreate the instance because the AMI architecture changes. The
> EIP survives but Docker named volumes do **not** — back up Postgres first.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `InvalidAMIID.NotFound` | The AMI lookup matched nothing in this region — uncommon. Check `region` is spelled correctly. |
| `VcpuLimitExceeded` from `tf-apply` | Your account's EC2 quota in this region is too low. Either request a quota increase (IAM → Service Quotas), or switch region. New accounts sometimes start at 0 vCPU quota in less-popular regions. |
| `cloud-init status --wait` errors during `make wait` | SSH in and `sudo cat /var/log/cloud-init-output.log`. Usually a transient apt error — re-run cloud-init with `sudo cloud-init clean && sudo cloud-init init`. |
| Caddy logs: `acme: error: ... no such host` | DNS A record isn't propagated yet. Wait, then `CLOUD=aws make restart SERVICE=caddy` (run on the VM via `make ssh`). |
| `auth-java` keeps OOM-killing on `t3.micro` | Expected. Set `instance_type = "t3.small"` and `tf-apply`. |
| WebRTC works on LAN but not over the internet | Confirm UDP 3478 + 49160–49200 are open in the AWS security group (they are by default; check you didn't tighten it). |
| Surprise charges after 12 months | Free tier expired. `CLOUD=aws make tf-destroy` removes the VM; the EIP charge stops the moment the instance is terminated. |

---

## What ISN'T free here vs. OCI

OCI Always Free is genuinely free forever. AWS free tier has expiration dates
and metered limits worth being aware of:

| Item | Free? | Catch |
| --- | --- | --- |
| EC2 `t3.micro` / `t2.micro` | 750 hours/mo for **12 months** | After 12 months: ~$7.50/mo for `t3.micro`, ~$8.50/mo for `t2.micro`. |
| EBS gp3 storage (30 GB) | First 30 GB free for 12 months | After: ~$2.40/mo for 30 GB. |
| Elastic IP | Free while attached to a running instance | $3.60/mo if unattached. Module attaches it; only a concern after `tf-destroy` if you forget to release the EIP. |
| Data transfer out | 100 GB/mo free indefinitely (as of late 2024) | Above that: ~$0.09/GB. Group video can chew through this. |
| Public IPv4 (since Feb 2024) | **Not free** — $3.60/mo per public IPv4 on a running instance | Counts against the free tier separately. Pricing recently changed; assume ~$3–4/mo even during the "free" 12 months. |

Rough end-of-free-tier cost for this stack on `t3.micro`: **$13–18/mo**.

If that's not acceptable, [`infra/oci/README.md`](../oci/README.md) is your
better answer.
