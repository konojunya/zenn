resource "cloudflare_r2_bucket" "tfstate" {
  account_id = local.account_id
  name       = "zero-trust-example"
}
