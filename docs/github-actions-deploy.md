# Automatic deploy from GitHub Actions

After **CI passes on a push to `main`**, the workflow **`.github/workflows/ci.yml`** can SSH into your VM, **`git pull`**, and run **`scripts/deploy.sh`** (production Docker Compose rebuild).

This is **opt-in** so forks and fresh clones do not fail on missing secrets.

---

## Step-by-step: enable GitHub Actions CD (full checklist)

### A. Things you need first

| Requirement | Why |
| ----------- | --- |
| **Admin access** to the GitHub repo | Only admins see **Settings** and can add secrets/variables. |
| A **VM** already running this app (Terraform + **`scripts/setup.sh`** once) | CD only updates code + Docker; it does not create the VM. |
| Ability to **`ssh`** into that VM yourself | Same host/user/key you’ll give GitHub. |
| **`main`** branch | Deploy runs only after a **push** to **`main`** (merge counts as push). |

---

### B. Find **Secrets** and **Variables** (same screen, two tabs)

1. Open your repo: **`https://github.com/YOUR_ORG/YOUR_REPO`**.
2. Click **Settings** (top bar).  
   - **No Settings link?** You are not an **admin** — ask the repo/org owner.
3. Left sidebar → **Secrets and variables**.
4. Click **Actions**.
5. At the **top** of the big panel you should see **two tabs**:
   - **Secrets**
   - **Variables** ← use this for **`DEPLOY_VIA_CI`**

**Direct links** (replace **`OWNER`** / **`REPO`**):

| Tab | URL pattern |
| --- | ----------- |
| Secrets | `https://github.com/OWNER/REPO/settings/secrets/actions` |
| Variables | `https://github.com/OWNER/REPO/settings/variables/actions` |

---

### C. Add the **repository variable** (turns deploy on)

1. **Settings → Secrets and variables → Actions**.
2. Open the **Variables** tab (not Secrets).
3. **New repository variable**.
4. **Name:** `DEPLOY_VIA_CI`
5. **Value:** `true` (exactly this word, lowercase).
6. Save.

Without this variable, workflow job **`deploy-vm`** is **skipped** every time.

---

### D. Create an SSH key **only for CI** (run on your laptop)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/letsgo_github_deploy -C "letsgo-deploy-ci" -N ""
```

- **`letsgo_github_deploy`** (no `.pub`) = **private** → goes into GitHub secret **`DEPLOY_SSH_KEY`** (never commit it).
- **`letsgo_github_deploy.pub`** = **public** → one line → goes into **`authorized_keys`** on the VM.

Put the public key on the server (example user **`ubuntu`**):

```bash
ssh-copy-id -i ~/.ssh/letsgo_github_deploy.pub ubuntu@YOUR_VM_IP_OR_DNS
```

Test:

```bash
ssh -i ~/.ssh/letsgo_github_deploy ubuntu@YOUR_VM_IP_OR_DNS "echo ok"
```

---

### Where each secret comes from (you are not “downloading” them from GitHub)

| Secret | Where you get the value |
| ------ | ------------------------ |
| **`DEPLOY_HOST`** | **Terraform:** `cd infra/aws && terraform output -raw public_ip` (same as **`outputs.tf`** **`public_ip`**). **AWS:** EC2 → instance → **Public IPv4**. **OCI:** instance **Public IP**. **DNS:** your **`DOMAIN`** A record target if it points at the VM — use the **same hostname/IP** you type after **`ssh user@…`**. |
| **`DEPLOY_USER`** | The Linux account you SSH as. **Ubuntu cloud images** in this repo use **`ubuntu`** (see **`infra/aws/outputs.tf`** **`ssh_command`**). If you use another AMI/user, use that username. |
| **`DEPLOY_SSH_KEY`** | **You generate it** — it is **not** stored in AWS/GitHub by default. Create with **`ssh-keygen`** (section D). Paste the **private** file into the secret. Put the matching **`.pub`** line on the VM in **`~/.ssh/authorized_keys`** for **`DEPLOY_USER`**. |
| **`DEPLOY_REPO_PATH`** | **Directory on the VM** where this repo lives. Our **cloud-init / Makefile** default is **`/home/ubuntu/letsgo`**. Confirm on the server: **`ssh …`** then **`pwd`** after **`cd`** into the repo, or **`git rev-parse --show-toplevel`**. |

---

### E. Add **four repository secrets**

1. **Settings → Secrets and variables → Actions**.
2. **Secrets** tab.
3. **New repository secret** — repeat for each row:

| Secret name | Paste |
| ----------- | ----- |
| **`DEPLOY_HOST`** | Your VM **public IP** or DNS (same host you SSH to). |
| **`DEPLOY_USER`** | SSH username — Ubuntu clouds usually **`ubuntu`**. |
| **`DEPLOY_SSH_KEY`** | Entire **private** key file contents (`BEGIN` … `END` lines included). |
| **`DEPLOY_REPO_PATH`** | Repo path on server — default in our docs: **`/home/ubuntu/letsgo`** |

To change **`DEPLOY_SSH_PORT`** or use a **passphrase** on the key, you must edit **`.github/workflows/ci.yml`** (`appleboy/ssh-action` **`port:`** / **`passphrase:`**) — they are not read automatically.

---

### F. VM: **`git pull`** must work with no password prompt

SSH into the VM:

```bash
cd /home/ubuntu/letsgo
git remote -v
git fetch origin && git checkout main && git pull --ff-only origin main
```

- **Public repo:** usually fine with HTTPS **`origin`**.
- **Private repo:** add a GitHub **deploy key** (read-only) or store credentials — otherwise **`deploy-vm`** fails at **`git pull`**.

Confirm prod env exists:

```bash
test -f /home/ubuntu/letsgo/.env.prod && echo ok
```

---

### G. Firewall / security group

GitHub-hosted runners use **many changing IPs**. Typical choices:

- Allow **SSH (TCP 22)** from **`0.0.0.0/0`** only if you use **key-only** login and accept brute-force noise (**fail2ban** helps).
- Or skip public SSH + use a **self-hosted runner** in your VPC (not documented here).

---

### H. Run a deploy

1. Push or merge to **`main`** (workflow **CI** runs all jobs including **e2e-smoke**).
2. After **e2e-smoke** succeeds → job **`Deploy (SSH + compose prod)`** runs.
3. **Actions** tab → open the workflow run → expand **`deploy-vm`** logs.

---

### I. Can’t see **Variables**?

| Cause | What to do |
| ----- | ---------- |
| Not repo admin | Owner must grant **Admin** or add secrets/variables for you. |
| Looking under **Organization** secrets only | Use **repository** Secrets and variables → **Actions** → **Variables** tab on **this repo**. |
| Org policy blocks Actions variables | Org owner: **Policies → Actions → General** — allow workflow permissions / variables per repo docs. |
| Enterprise GitHub | UI names may differ; search org docs for **repository variables**. |

---

## Quick reference

### Variable (Variables tab)

| Name | Value |
| ---- | ----- |
| **`DEPLOY_VIA_CI`** | **`true`** |

### Secrets (Secrets tab)

| Name | Example meaning |
| ---- | ---------------- |
| **`DEPLOY_HOST`** | Your VM IP/DNS |
| **`DEPLOY_USER`** | **`ubuntu`** |
| **`DEPLOY_SSH_KEY`** | Private key PEM |
| **`DEPLOY_REPO_PATH`** | **`/home/ubuntu/letsgo`** |

---

## What runs on the server

```bash
cd "$DEPLOY_REPO_PATH"
git fetch origin main
git checkout main
git pull --ff-only origin main
bash scripts/deploy.sh
```

**`deploy.sh`** → **`docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`** (timeout **45m** over SSH).

---

## Behaviour

- **PRs:** no deploy job.
- **`main` push:** deploy after green **e2e**, if **`DEPLOY_VIA_CI`** is **`true`**.
- **`main`**: workflows are **not** cancelled mid-flight when another push lands (safer for deploy).

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| **`deploy-vm` missing / skipped** | Add **`DEPLOY_VIA_CI`** on **Variables** tab (not Secrets). |
| SSH failed | Keys, **`DEPLOY_USER`**, **`DEPLOY_HOST`**, **`authorized_keys`**. |
| **`git pull`** failed | **`origin`**, branch **`main`**, private-repo auth on VM. |
| Docker failed | Run **`bash scripts/deploy.sh`** manually on VM for logs. |

See **`docs/deployment-current.md`** and **`frontend/README.md`**.
