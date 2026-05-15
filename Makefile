# letsgo — convenience targets for free-tier deployment.
#
# Two groups of targets:
#   • LOCAL (run on your laptop) — Terraform + SSH wrappers
#   • REMOTE (run on the VM)     — docker compose wrappers
#
# Cloud provider is selected via CLOUD (default "oci"). Override on the CLI
# or via `export CLOUD=aws`:
#     CLOUD=oci make tf-apply         # Oracle Cloud (default, forever free)
#     CLOUD=aws make tf-apply         # AWS free tier (12 months)
#
# Quickstart:
#     make tf-init tf-apply                  # provision the VM
#     make wait                              # wait for cloud-init
#     make remote-setup                      # generate secrets + deploy (over SSH)
#     make logs                              # tail logs (on VM only)
#
# Tear down (DESTROYS THE VM AND DATA):
#     make tf-destroy

SHELL := /bin/bash

CLOUD     ?= oci
INFRA_DIR ?= infra/$(CLOUD)
COMPOSE   := docker compose --env-file .env.prod -f docker-compose.prod.yml

# `terraform output` is cached so we don't re-shell out on every target.
VM_IP = $(shell cd $(INFRA_DIR) && terraform output -raw public_ip 2>/dev/null)

.DEFAULT_GOAL := help

## ─── Help ────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show available targets
	@printf "letsgo make targets\n\n"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ \
		{ printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST) \
		| sort

## ─── LOCAL: Terraform / provisioning ─────────────────────────────────────────

.PHONY: tf-init tf-plan tf-apply tf-destroy tf-output ip
tf-init: ## Initialize Terraform providers (run once)
	cd $(INFRA_DIR) && terraform init

tf-plan: ## Show pending infra changes
	cd $(INFRA_DIR) && terraform plan

tf-apply: ## Create / update the VM and network
	cd $(INFRA_DIR) && terraform apply

tf-destroy: ## ⚠ Delete the VM and its boot volume
	cd $(INFRA_DIR) && terraform destroy

tf-output: ## Print Terraform outputs
	cd $(INFRA_DIR) && terraform output

ip: ## Print just the VM's public IPv4
	@echo $(VM_IP)

## ─── LOCAL: SSH wrappers ─────────────────────────────────────────────────────

.PHONY: wait ssh remote-setup remote-deploy remote-logs remote-down
wait: ## Wait for SSH + cloud-init to complete on the new VM
	bash scripts/wait-for-vm.sh $(VM_IP)

ssh: ## Open an SSH session to the VM
	ssh ubuntu@$(VM_IP)

remote-setup: ## Generate secrets and deploy (first-time run on the VM)
	ssh -t ubuntu@$(VM_IP) "cd /home/ubuntu/letsgo && git pull && bash scripts/setup.sh"

remote-deploy: ## Pull latest code on the VM and redeploy
	ssh -t ubuntu@$(VM_IP) "cd /home/ubuntu/letsgo && git pull && bash scripts/deploy.sh"

remote-logs: ## Tail logs from the VM (Ctrl-C to stop)
	ssh -t ubuntu@$(VM_IP) "cd /home/ubuntu/letsgo && bash scripts/logs.sh"

remote-down: ## Stop the stack on the VM (data preserved)
	ssh -t ubuntu@$(VM_IP) "cd /home/ubuntu/letsgo && bash scripts/down.sh"

## ─── REMOTE: docker compose (use these once you `make ssh` into the VM) ──────

.PHONY: setup deploy logs down ps restart
setup: ## On the VM: generate .env.prod + first deploy
	bash scripts/setup.sh

deploy: ## On the VM: build and (re)start the stack
	bash scripts/deploy.sh

logs: ## On the VM: tail logs
	bash scripts/logs.sh

down: ## On the VM: stop the stack (keeps data)
	bash scripts/down.sh

ps: ## On the VM: show container status
	$(COMPOSE) ps

restart: ## On the VM: restart a single service (SERVICE=name)
	@[[ -n "$(SERVICE)" ]] || { echo "Usage: make restart SERVICE=name"; exit 1; }
	$(COMPOSE) up -d --no-deps --force-recreate $(SERVICE)
