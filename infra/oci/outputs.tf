output "public_ip" {
  description = "Public IPv4 of the VM. Point your DNS A record here and set TURN_EXTERNAL_IP in .env.prod."
  value       = oci_core_instance.letsgo.public_ip
}

output "ssh_command" {
  description = "Convenience SSH command for the new VM."
  value       = "ssh ubuntu@${oci_core_instance.letsgo.public_ip}"
}

output "instance_state" {
  description = "OCI instance lifecycle state."
  value       = oci_core_instance.letsgo.state
}
