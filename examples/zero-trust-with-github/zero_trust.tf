resource "cloudflare_zero_trust_access_identity_provider" "github" {
  name       = "github"
  account_id = local.account_id
  type       = "github"
  config = {
    client_id     = var.github_client_id
    client_secret = var.github_client_secret
  }
}

resource "cloudflare_zero_trust_access_policy" "employee" {
  name             = "employee"
  account_id       = local.account_id
  decision         = "allow"
  session_duration = "6h"

  include = [
    for account in local.allowed_users : {
      email = {
        email = account
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "zero-trust-example" {
  name         = "zero trust example"
  account_id   = local.account_id
  allowed_idps = [cloudflare_zero_trust_access_identity_provider.github.id]
  type         = "self_hosted"

  policies = [{
    id         = cloudflare_zero_trust_access_policy.employee.id
    precedence = 1
  }]

  domain = "zero-trust-with-github.works-b49.workers.dev"
}
