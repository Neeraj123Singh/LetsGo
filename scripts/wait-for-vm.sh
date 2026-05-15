#!/usr/bin/env bash
# Poll the VM's SSH port until cloud-init finishes the first-boot bootstrap.
# Used by `make ssh` and `make remote-setup` so they don't race the VM coming
# up.
#
# Usage:
#   bash scripts/wait-for-vm.sh <ip>

source "$(dirname "$0")/lib.sh"

VM_IP="${1:-}"
[[ -n "$VM_IP" ]] || die "Usage: $0 <vm-public-ip>"

require_cmd ssh

log "Waiting for SSH on $VM_IP …"
for i in $(seq 1 60); do
  if ssh -o StrictHostKeyChecking=accept-new \
         -o ConnectTimeout=5 \
         -o BatchMode=yes \
         "ubuntu@$VM_IP" true 2>/dev/null; then
    ok "SSH is up."
    break
  fi
  sleep 5
  [[ $i -eq 60 ]] && die "SSH did not come up after 5 minutes."
done

log "Waiting for cloud-init to finish (Docker + repo clone) …"
ssh -o StrictHostKeyChecking=accept-new "ubuntu@$VM_IP" "cloud-init status --wait" \
  || die "cloud-init failed — inspect /var/log/cloud-init-output.log on the VM."

ok "VM ready. Run \`make remote-setup\` to deploy the app."
