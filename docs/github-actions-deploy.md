# Automatic deploy from GitHub Actions

After **CI passes on a push to `main`**, the workflow **`.github/workflows/ci.yml`** can SSH into your VM, **`git pull`**, and run **`scripts/deploy.sh`** (production Docker Compose rebuild).

This is **opt-in** so forks and fresh clones do not fail on missing secrets.

---

## 1. Enable the deploy job

**GitHub → Repository → Settings → Secrets and variables → Actions → Variables**

| Variable | Value |
| -------- | ----- |
| **`DEPLOY_VIA_CI`** | `true` |

Until this is set to **`true`**, the **`deploy-vm`** job is skipped.

---

## 2. Configure secrets

**Settings → Secrets and variables → Actions → Secrets**

| Secret | Required | Description |
| ------ | -------- | ------------- |
| **`DEPLOY_HOST`** | Yes | Public hostname or IPv4 of the VM (same host you SSH to). |
| **`DEPLOY_USER`** | Yes | SSH login user (for Ubuntu cloud images usually **`ubuntu`**). |
| **`DEPLOY_SSH_KEY`** | Yes | Private key (**PEM/OpenSSH**) whose **public** half is in **`~/.ssh/authorized_keys`** on the VM. Prefer a **deploy-only** key, not your personal laptop key. |
| **`DEPLOY_REPO_PATH`** | Yes | Absolute path to the repo on the server (cloud-init uses **`/home/ubuntu/letsgo`**). |

Optional hardening (see [appleboy/ssh-action](https://github.com/appleboy/ssh-action)):

- **`DEPLOY_SSH_PASSPHRASE`** — if the private key is passphrase-protected (add **`passphrase:`** to the workflow `with:` block if you use this).
- **`DEPLOY_SSH_PORT`** — non-default SSH port (add **`port:`** to the workflow `with:` block).

---

## 3. VM prerequisites

1. **Repo clone** at **`DEPLOY_REPO_PATH`** with **`origin`** pointing at **this** GitHub repo (`git remote -v`).
2. **`git pull`** works **non-interactively**:
   - **Public repo**: HTTPS clone is enough.
   - **Private repo**: use a deploy key with read access, or HTTPS + credential helper / PAT on the VM.
3. **Docker Compose prod** already configured once (**`.env.prod`**, **`scripts/setup.sh`** done).
4. **Firewall / security group**: inbound **TCP 22** must allow GitHub-hosted runners to reach the VM. Runner egress IPs change; many teams either:
   - restrict SSH to your home/office IP and use **`workflow_dispatch`** + self-hosted runner instead, or  
   - accept SSH from `0.0.0.0/0` only with key-based auth + `fail2ban` (understand the risk).

---

## 4. What the job runs

Roughly:

```bash
cd "$DEPLOY_REPO_PATH"
git fetch origin main
git checkout main
git pull --ff-only origin main
bash scripts/deploy.sh
```

**`deploy.sh`** runs **`docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`**, so the **frontend** image (PWA assets) rebuilds when the compose file and context change.

The SSH step uses **`command_timeout: 45m`** to allow slow **`npm run build`** / Docker builds on small instances.

---

## 5. Workflow behaviour notes

- **Pull requests** do not run **`deploy-vm`** (only **`push`** to **`main`**).
- **Concurrency**: pushes to **`main`** do **not** cancel an in-flight workflow (`cancel-in-progress` is off for `refs/heads/main`) so a deploy is less likely to be cut off mid-flight when two merges land close together.
- **Other branches / PRs** still use **cancel-in-progress** so older redundant CI runs stop.

---

## 6. Troubleshooting

| Symptom | Check |
| ------- | ----- |
| Job skipped | **`DEPLOY_VIA_CI`** variable is exactly **`true`**. |
| SSH auth failed | **`DEPLOY_USER`**, **`DEPLOY_SSH_KEY`**, and `authorized_keys` on the VM. |
| `git pull` failed | Remote URL, branch **`main`**, private-repo credentials on the VM. |
| Compose failed | **`~/.env.prod`** present; run **`bash scripts/deploy.sh`** manually once on the VM and read the error. |

See also **`docs/deployment-current.md`** and **`frontend/README.md`** (PWA / cache after deploy).
