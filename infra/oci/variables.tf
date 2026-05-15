variable "tenancy_ocid" {
  description = "Your Oracle Cloud tenancy OCID (Profile → Tenancy in the OCI console)."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID where the VM should live. Use the root tenancy OCID if you have not created a child compartment."
  type        = string
}

variable "region" {
  description = "OCI region identifier, e.g. \"ap-mumbai-1\" or \"us-ashburn-1\"."
  type        = string
}

variable "oci_profile" {
  description = "Profile name inside ~/.oci/config to authenticate with."
  type        = string
  default     = "DEFAULT"
}

variable "name_prefix" {
  description = "Short prefix prepended to every resource name. Useful when running multiple stacks in the same compartment."
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
  description = "Public HTTPS URL of the letsgo git repo. The cloud-init script clones this on first boot so the VM is ready to run \"make setup\"."
  type        = string
}

variable "git_repo_branch" {
  description = "Branch checked out by cloud-init."
  type        = string
  default     = "main"
}

variable "instance_ocpus" {
  description = "Number of ARM cores to allocate. Always-Free total budget across all A1 instances in your tenancy is 4."
  type        = number
  default     = 4
}

variable "instance_memory_gb" {
  description = "Memory in GB. Always-Free total budget across all A1 instances in your tenancy is 24."
  type        = number
  default     = 24
}
