output "public_ip" {
  description = "Elastic IPv4 of the VM. Point your DNS A record here and set TURN_EXTERNAL_IP in .env.prod."
  value       = aws_eip.letsgo.public_ip
}

output "ssh_command" {
  description = "Convenience SSH command for the new VM."
  value       = "ssh ubuntu@${aws_eip.letsgo.public_ip}"
}

output "instance_id" {
  description = "EC2 instance ID (useful for the AWS console)."
  value       = aws_instance.letsgo.id
}

output "ami_id" {
  description = "AMI that backs the instance (Canonical Ubuntu 22.04)."
  value       = data.aws_ami.ubuntu.id
}
