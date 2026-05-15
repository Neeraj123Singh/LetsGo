terraform {
  required_version = ">= 1.5.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

# Authenticates via `oci setup config` (default ~/.oci/config) so no secrets
# need to live in this repo or in environment variables.
provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# The newest Ubuntu 22.04 ARM image. The OCI image list churns frequently so we
# always pick the latest by creation time rather than pinning an OCID.
data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

resource "oci_core_vcn" "letsgo" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "${var.name_prefix}-vcn"
  dns_label      = "letsgo"
}

resource "oci_core_internet_gateway" "letsgo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.letsgo.id
  enabled        = true
  display_name   = "${var.name_prefix}-igw"
}

resource "oci_core_route_table" "letsgo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.letsgo.id
  display_name   = "${var.name_prefix}-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.letsgo.id
  }
}

resource "oci_core_security_list" "letsgo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.letsgo.id
  display_name   = "${var.name_prefix}-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH — restrict to a CIDR if you have a static IP at home.
  ingress_security_rules {
    description = "SSH"
    source      = var.ssh_ingress_cidr
    protocol    = "6" # TCP
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP (Caddy redirect target → HTTPS) and ACME http-01.
  ingress_security_rules {
    description = "HTTP"
    source      = "0.0.0.0/0"
    protocol    = "6"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS.
  ingress_security_rules {
    description = "HTTPS"
    source      = "0.0.0.0/0"
    protocol    = "6"
    tcp_options {
      min = 443
      max = 443
    }
  }

  # HTTP/3 over QUIC.
  ingress_security_rules {
    description = "HTTP/3 (QUIC)"
    source      = "0.0.0.0/0"
    protocol    = "17" # UDP
    udp_options {
      min = 443
      max = 443
    }
  }

  # STUN + TURN/UDP.
  ingress_security_rules {
    description = "STUN/TURN"
    source      = "0.0.0.0/0"
    protocol    = "17"
    udp_options {
      min = 3478
      max = 3478
    }
  }

  # TURN media relay range — matches coturn/turnserver.conf min/max-port.
  ingress_security_rules {
    description = "TURN relay"
    source      = "0.0.0.0/0"
    protocol    = "17"
    udp_options {
      min = 49160
      max = 49200
    }
  }
}

resource "oci_core_subnet" "letsgo" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.letsgo.id
  cidr_block        = "10.0.0.0/24"
  display_name      = "${var.name_prefix}-subnet"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.letsgo.id
  security_list_ids = [oci_core_security_list.letsgo.id]
}

# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

resource "oci_core_instance" "letsgo" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-vm"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gb
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_arm.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.letsgo.id
    assign_public_ip = true
    hostname_label   = "letsgo"
  }

  metadata = {
    ssh_authorized_keys = file(var.ssh_public_key_path)
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml", {
      git_repo_url    = var.git_repo_url
      git_repo_branch = var.git_repo_branch
    }))
  }

  preserve_boot_volume = false
}
