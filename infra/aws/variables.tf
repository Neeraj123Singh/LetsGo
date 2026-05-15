variable "region" {
  description = "AWS region identifier, e.g. \"ap-south-1\" (Mumbai), \"us-east-1\" (N. Virginia)."
  type        = string
}

variable "aws_profile" {
  description = "Profile name inside ~/.aws/credentials to authenticate with."
  type        = string
  default     = "default"
}

variable "name_prefix" {
  description = "Short prefix prepended to every resource name. Useful when running multiple stacks in the same account."
  type        = string
  default     = "letsgo"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key (typically ~/.ssh/id_ed25519.pub) installed for the ubuntu user."
  type        = string
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH into the VM. Tighten to your /32 if you have a static IP."
  type        = string
  default     = "0.0.0.0/0"
}

variable "git_repo_url" {
  description = "Public HTTPS URL of the letsgo git repo. The cloud-init script clones this on first boot so the VM is ready to run `make setup`."
  type        = string
}

variable "git_repo_branch" {
  description = "Branch checked out by cloud-init."
  type        = string
  default     = "main"
}

variable "instance_type" {
  description = <<-EOT
    EC2 instance type.

      • t3.micro / t2.micro — free tier (12 months), 1 GB RAM. TIGHT for this
        stack: the JVM auth service alone wants 400–600 MB. cloud-init.yaml
        configures 2 GB of swap to keep it from OOMing, but expect sluggish
        first-build and occasional thrashing. Fine for kicking the tyres.
      • t3.small — ~$15/mo (not free), 2 GB RAM. Comfortable.
      • t3.medium — ~$30/mo, 4 GB RAM. Recommended for any real users.
      • t4g.small — ~$12/mo, 2 GB RAM, ARM (Graviton). Cheapest stable option.

    If you pick a Graviton (arm64) family, the AMI lookup auto-switches.
  EOT
  type        = string
  default     = "t3.micro"
}

variable "ami_architecture" {
  description = "Override AMI architecture (\"amd64\" or \"arm64\"). Leave null to auto-derive from instance_type."
  type        = string
  default     = null
  validation {
    condition     = var.ami_architecture == null || contains(["amd64", "arm64"], coalesce(var.ami_architecture, "amd64"))
    error_message = "ami_architecture must be \"amd64\", \"arm64\", or null."
  }
}

variable "root_volume_gb" {
  description = "Root EBS volume size in GB. Free tier covers 30 GB of gp3 across all EBS in the account."
  type        = number
  default     = 30
}

variable "swap_size_gb" {
  description = "Size of the swap file created on first boot, in GB. Helpful headroom for 1 GB instances; set to 0 to disable."
  type        = number
  default     = 2
}
