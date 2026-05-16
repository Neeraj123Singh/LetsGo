# How deployment works today

This describes the **actually wired paths** in this repo: **GitHub Actions CI** (validation on every push/PR to `main`), **optional CD** (SSH + `scripts/deploy.sh` after CI on pushes to `main`), and **manual infrastructure + VM setup** (Terraform + Docker Compose on a single VM).

---

## Mental model

```mermaid
flowchart LR
  subgraph github [GitHub]
    PR[Push / PR to main]
    GHA[.github/workflows/ci.yml]
    PR --> GHA
    GHA --> DEP[deploy-vm optional SSH]
  end

  subgraph laptop [Your machine]
    TF[Terraform apply]
    INFRA[infra/aws or infra/oci]
    TF --> INFRA
  end

  subgraph vm [Cloud VM]
    GIT[Repo clone / git pull]
    SETUP[scripts/setup.sh]
    DX[scripts/deploy.sh]
    COMPOSE[docker-compose.prod.yml]
    GIT --> SETUP
    GIT --> DX
    DX --> COMPOSE
  end

  DEP -. SSH git pull + deploy.sh .-> vm
  GHA -. validates builds/tests .-> QA[CI jobs]
  INFRA --> vm
```

| Concern | Mechanism |
| -------- | --------- |
| **Quality gate before merge** | GitHub Actions builds frontend, runs Go/Java tests, smoke-tests Compose |
| **Optional production refresh** | **`deploy-vm`** job (requires **`DEPLOY_VIA_CI=true`** + SSH secrets) — see **`docs/github-actions-deploy.md`** |
| **Provision VM + network** | Terraform under `infra/aws` or `infra/oci` |
| **Install Docker & clone repo** | Cloud-init on first boot (`cloud-init.yaml`) |
| **Secrets & env** | `.env.prod` on the VM (`scripts/generate-env.sh`, template `.env.prod.example`) |
| **Run app stack** | `docker compose --env-file .env.prod -f docker-compose.prod.yml` |

---

## 1. CI/CD — GitHub Actions

### What runs

Workflow file: **`.github/workflows/ci.yml`**

| Trigger | Purpose |
| ------- | ------- |
| `push` to **`main`** | Full CI after merge; **optional `deploy-vm`** after **`e2e-smoke`** succeeds |
| `pull_request` targeting **`main`** | Gate before merge (**no deploy**) |

Concurrency:

- **`refs/heads/main`**: **`cancel-in-progress: false`** so two rapid merges do not cancel an in-flight deploy.
- **Other refs** (PRs, feature branches): **`cancel-in-progress: true`** to save runner minutes.

### Jobs and responsibilities

| Job | Working dir / context | What it does |
| --- | --------------------- | ------------- |
| **frontend** | `frontend/` | `npm ci`, `npm run build` |
| **meeting-go** | `services/meeting-go/` | `go test ./...` |
| **auth-java** | `services/auth-java/` | `mvn -B test` |
| **e2e-smoke** | repo root | Waits for **`docker compose`** (default **`docker-compose.yml`**) — frontend on `:3000`; installs Chrome; **`pytest tests/e2e`** |
| **deploy-vm** | (remote over SSH) | **Skipped** unless repo variable **`DEPLOY_VIA_CI`** is **`true`**. Runs **`git pull`** on **`main`** + **`bash scripts/deploy.sh`** on the VM (`appleboy/ssh-action`). |

`e2e-smoke` **`needs`** the three compile/test jobs so obvious breakage fails fast. **`deploy-vm`** **`needs`** **`e2e-smoke`**.

Full secret/variable checklist: **`docs/github-actions-deploy.md`**.

### Pros and cons (GitHub Actions as implemented)

| Pros | Cons |
| ---- | ---- |
| Reproducible checks on clean Ubuntu runners | **E2E** does not exercise **`docker-compose.prod.yml`** / Caddy / Let’s Encrypt |
| Optional **push-to-main** deploy without extra tooling | **GitHub-hosted runner → SSH**: you must allow SSH from the internet or use a runner in your VPC |
| Parallel CI jobs keep wall-clock reasonable | Runner egress IPs change — restrictive SG “GitHub IPs only” is painful |
| Uses maintained actions (`checkout`, `setup-*`, **`appleboy/ssh-action`**) | **`deploy-vm`** requires correct **`git`** credentials on the VM for private repos |

### Improving CI/CD later

- Add **`workflow_dispatch`** on **`deploy-vm`** for manual redeploy without empty commits.
- Build/push images to a registry and **`compose pull`** on the VM instead of building on the VM (lighter CI egress, heavier registry setup).
- Cache Docker layers in GHA for faster e2e.

---

## 2. Terraform — provision the VM

Two interchangeable modules (pick one via **`Makefile`** variable **`CLOUD`**):

| Directory | Cloud | Typical use |
| --------- | ----- | ------------- |
| **`infra/aws/`** | AWS EC2 + VPC + SG + EIP | Free tier / paid small instance |
| **`infra/oci/`** | Oracle Cloud ARM instance | Always-free tier with more RAM |

### Files (same shape in both folders)

| File | Role |
| ---- | ---- |
| **`main.tf`** | Providers, VPC/network, security rules, compute instance, SSH key wiring, user-data → cloud-init |
| **`variables.tf`** | Inputs (region, instance shape, SSH key path, repo URL, domain hints, etc.) |
| **`outputs.tf`** | **`public_ip`** and other values consumed by **`Makefile`** / docs |
| **`terraform.tfvars.example`** | Copy to **`terraform.tfvars`** (usually gitignored); local overrides |
| **`cloud-init.yaml`** | First-boot: Docker install, optional swap, **clone repo** into `/home/ubuntu/letsgo`, etc. |
| **`README.md`** | Provider-specific steps and caveats |
| **`.gitignore`** | Typically ignores `.terraform/`, `*.tfstate*`, `terraform.tfvars` |

Root **`Makefile`** abstracts Terraform:

- **`CLOUD=aws`** → `infra/aws`
- **`CLOUD=oci`** (default) → `infra/oci`

Targets: **`tf-init`**, **`tf-plan`**, **`tf-apply`**, **`tf-destroy`**, **`wait`** (SSH/cloud-init), **`remote-setup`** / **`remote-deploy`** (SSH into VM).

### Pros and cons (Terraform single-VM)

| Pros | Cons |
| ---- | ---- |
| Repeatable infra; **`terraform destroy`** tears down cleanly | Single VM = single point of failure |
| VPC + SG isolate this project from rest of account | No built-in auto-scaling or rolling deploy |
| Elastic IP (AWS) / stable public endpoint patterns | State file must be handled carefully (remote backend not enforced in-repo) |
| Same app deploy scripts regardless of AWS vs OCI | Cold start RAM on smallest AWS SKU is tight (see **`infra/aws/README.md`**) |

---

## 3. On the VM — scripts and Compose

After Terraform + cloud-init, the app is deployed with shell wrappers around **production Compose**.

### Shell scripts (`scripts/`)

| Script | Purpose |
| ------ | ------- |
| **`lib.sh`** | Shared paths: **`REPO_ROOT`**, **`ENV_FILE=.env.prod`**, **`COMPOSE_FILE=docker-compose.prod.yml`**, **`compose()`** helper |
| **`generate-env.sh`** | Creates **`.env.prod`** from **`.env.prod.example`** with generated secrets (invoked by **`setup.sh`** if missing) |
| **`setup.sh`** | First-time: generate env if missing → **`deploy.sh`** |
| **`deploy.sh`** | `docker compose pull` (best-effort) → **`compose up -d --build`** |
| **`down.sh`** | Stop stack without destroying volumes |
| **`logs.sh`** | Tail Compose logs |
| **`wait-for-vm.sh`** | Local helper: wait until SSH + cloud-init ready (**`Makefile`** **`wait`**) |

### Compose files

| File | Role |
| ---- | ---- |
| **`docker-compose.yml`** | Local dev / **CI e2e**: exposed ports, simpler TLS story |
| **`docker-compose.prod.yml`** | **Production**: internal Postgres/auth/meeting; **Caddy** on 80/443 with Let’s Encrypt; **coturn** UDP range; **`migrate`** job before apps |

Details inside **`docker-compose.prod.yml`** include: **`postgres`**, **`migrate`** ( **`migrations/go/`** ), **`auth-java`**, **`meeting-go`**, **`frontend`** (nginx serving built SPA), **`caddy`**, **`coturn`**.

### Env template

| File | Role |
| ---- | ---- |
| **`.env.prod.example`** | Document required variables (`DOMAIN`, `POSTGRES_PASSWORD`, `LETSGO_JWT_SECRET`, TURN settings, …) |

---

## 4. Typical flows

### First-time production deploy

1. Configure Terraform (`terraform.tfvars` from example).
2. **`make tf-init tf-apply`** (or **`CLOUD=aws make …`**).
3. **`make wait`** until VM is ready.
4. SSH to VM; ensure repo at **`~/letsgo`** (cloud-init clone or your rsync).
5. **`bash scripts/setup.sh`** → creates **`.env.prod`**, runs **`deploy.sh`**.
6. Point DNS **`A`** record at **`public_ip`**; wait for Caddy + ACME.

### Subsequent releases

1. **`git pull`** (or rsync) on the VM.
2. **`bash scripts/deploy.sh`** — rebuild and recreate containers.

From laptop: **`make remote-deploy`** runs **`git pull`** + **`deploy.sh`** over SSH (requires **`Makefile`**’s **`VM_IP`** from **`terraform output`**).

**Or** enable **`DEPLOY_VIA_CI`** + SSH secrets so **`deploy-vm`** runs automatically after green CI on **`main`** — **`docs/github-actions-deploy.md`**.

---

## 5. Summary trade-off table

| Piece | Strength | Weakness |
| ----- | -------- | -------- |
| **GHA CI** | Fast feedback; blocks broken merges | Prod compose / TLS not exercised in default e2e |
| **`deploy-vm`** | Hands-off refresh after merge | SSH exposure / runner trust boundary |
| **Terraform** | Infra as code; repeatable VM | Operational maturity (state locking, drift) is on you |
| **Docker Compose on one VM** | Simple ops model; matches README quickstarts | Vertical scaling only; deploy interrupts unless extended |
| **Manual deploy only** | No GitHub secrets | Requires discipline (`pull` + **`deploy.sh`**) |

For **HTTPS / Let’s Encrypt / Caddy**, see **`docs/https-tls.md`**.

For product-level technical trade-offs (mesh WebRTC, Postgres, JWT, etc.), see **`docs/engineering-tradeoffs.md`**.
