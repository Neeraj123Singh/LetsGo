terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# Authenticates via the standard AWS provider chain — `aws configure` writes
# ~/.aws/credentials and ~/.aws/config which Terraform reads automatically.
# No secrets need to live in this repo.
provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

# Pick the right AMI architecture from the instance type. t4g/a1/c6g/c7g/m6g/
# m7g/r6g/r7g families are Graviton (arm64); everything else we expose here is
# x86_64. Override `ami_architecture` directly if you use an unlisted family.
locals {
  arm_prefixes = ["t4g.", "a1.", "c6g.", "c7g.", "m6g.", "m7g.", "r6g.", "r7g."]
  inferred_arch = anytrue([
    for p in local.arm_prefixes : startswith(var.instance_type, p)
  ]) ? "arm64" : "amd64"

  ami_arch = coalesce(var.ami_architecture, local.inferred_arch)
}

# Newest Ubuntu 22.04 LTS image published by Canonical (account 099720109477).
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-jammy-22.04-${local.ami_arch}-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------------------------------------------------------------------------
# Network — single public subnet in the first AZ of the chosen region.
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "letsgo" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.name_prefix}-vpc"
  }
}

resource "aws_internet_gateway" "letsgo" {
  vpc_id = aws_vpc.letsgo.id

  tags = {
    Name = "${var.name_prefix}-igw"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.letsgo.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.name_prefix}-public"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.letsgo.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.letsgo.id
  }

  tags = {
    Name = "${var.name_prefix}-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------
# Security group — mirrors the OCI security list.
# ---------------------------------------------------------------------------

resource "aws_security_group" "letsgo" {
  name        = "${var.name_prefix}-sg"
  description = "Inbound traffic for the letsgo single-VM stack"
  vpc_id      = aws_vpc.letsgo.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_ingress_cidr]
  }

  ingress {
    description = "HTTP (Caddy redirect + ACME http-01)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP/3 (QUIC)"
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN + TURN/UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "TURN media relay"
    from_port   = 49160
    to_port     = 49200
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-sg"
  }
}

# ---------------------------------------------------------------------------
# SSH key — uploaded from the path you set in tfvars.
# ---------------------------------------------------------------------------

resource "aws_key_pair" "letsgo" {
  key_name   = "${var.name_prefix}-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# ---------------------------------------------------------------------------
# Compute — the one EC2 instance that runs the whole compose stack.
# ---------------------------------------------------------------------------

resource "aws_instance" "letsgo" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  key_name      = aws_key_pair.letsgo.key_name

  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.letsgo.id]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    delete_on_termination = true
    encrypted             = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    git_repo_url    = var.git_repo_url
    git_repo_branch = var.git_repo_branch
    swap_size_gb    = var.swap_size_gb
  })

  # Recreate the instance if user_data changes so first-boot bootstrap reruns.
  user_data_replace_on_change = true

  tags = {
    Name = "${var.name_prefix}-vm"
  }
}

# Elastic IP — keeps the public IP stable across stop/start. EIPs are free
# while attached to a running instance.
resource "aws_eip" "letsgo" {
  domain   = "vpc"
  instance = aws_instance.letsgo.id

  tags = {
    Name = "${var.name_prefix}-eip"
  }

  depends_on = [aws_internet_gateway.letsgo]
}

