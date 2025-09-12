terraform {
  required_version = "1.13.2"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }

  backend "s3" {
    endpoints = {
      s3 = "https://b49140272491ddf93589b24d6068e36f.r2.cloudflarestorage.com"
    }
    bucket                      = "zero-trust-example"
    key                         = "terraform.tfstate"
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

provider "cloudflare" {
}

variable "github_client_id" {
  type = string
}

variable "github_client_secret" {
  type = string
}

locals {
  account_id = "b49140272491ddf93589b24d6068e36f"

  allowed_users = [
    "許可したい人の GitHub のメールアドレス",
  ]
}