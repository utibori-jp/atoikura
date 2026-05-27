#!/bin/bash
# Egress firewall for the atoikura devcontainer.
# Adapted from Anthropic's reference (init-firewall.sh) with a minimal
# allowlist tailored to this project (Go module proxy added; statsig/sentry
# kept because Claude Code itself talks to them).
#
# Runs once at container start via the devcontainer.json postStartCommand
# (with sudo, see /etc/sudoers.d/node-firewall in the Dockerfile).
#
# Anything not on the allowlist is DROPPED. If you add a new external
# dependency to the project, you almost certainly need to add it here.

set -euo pipefail
IFS=$'\n\t'

# Preserve the Docker internal DNS rules so sibling services (db, adminer)
# remain resolvable after we flush the chains.
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

if [ -n "$DOCKER_DNS_RULES" ]; then
  echo "Restoring Docker DNS rules..."
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# Baseline: DNS + SSH + localhost are always on.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT  -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow traffic between containers on the same Docker bridge network
# (so the dev container can reach the `db` and `adminer` services).
# RFC1918 ranges cover Docker's default bridge subnets.
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
iptables -A INPUT  -s 172.16.0.0/12 -j ACCEPT
iptables -A OUTPUT -d 10.0.0.0/8    -j ACCEPT
iptables -A INPUT  -s 10.0.0.0/8    -j ACCEPT
iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT
iptables -A INPUT  -s 192.168.0.0/16 -j ACCEPT

ipset create allowed-domains hash:net

# GitHub: clone, gh CLI, go modules hosted there.
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ] || ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  echo "ERROR: failed to fetch GitHub meta"
  exit 1
fi
while read -r cidr; do
  if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
    echo "ERROR: invalid CIDR from GitHub meta: $cidr"
    exit 1
  fi
  ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# Other allowed domains. Add new ones with a one-line comment explaining why.
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "sentry.io" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "proxy.golang.org" \
    "sum.golang.org" \
    "go.dev" \
    "dl.google.com" \
    "objects.githubusercontent.com" \
    ; do
  echo "Resolving $domain..."
  ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
  if [ -z "$ips" ]; then
    echo "ERROR: failed to resolve $domain"
    exit 1
  fi
  while read -r ip; do
    ipset add allowed-domains "$ip"
  done <<< "$ips"
done

# Apply: established connections, allowed-domains, then default DROP.
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -P INPUT  DROP
iptables -P OUTPUT DROP
iptables -P FORWARD DROP

echo "Firewall initialised."
