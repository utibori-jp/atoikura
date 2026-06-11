# Devcontainer for atoikura.
# Adapted from Anthropic's reference Claude Code devcontainer
# (https://github.com/anthropics/claude-code/tree/main/.devcontainer),
# stripped of zsh/powerlevel10k/fzf and extended with Go 1.25, sqlc,
# and postgresql-client for this project's stack.

FROM node:24

ARG TZ=Asia/Tokyo
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest
ARG GO_VERSION=1.25.0
ARG SQLC_VERSION=v1.27.0
ARG GIT_DELTA_VERSION=0.18.2

# System packages: dev essentials + iptables/ipset for the egress firewall +
# postgresql-client for the migrate.sh script that talks to the db service.
RUN apt-get update && apt-get install -y --no-install-recommends \
      less \
      git \
      procps \
      sudo \
      unzip \
      gh \
      iptables \
      ipset \
      iproute2 \
      dnsutils \
      aggregate \
      jq \
      nano \
      vim \
      ca-certificates \
      postgresql-client \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Go 1.25 from the official tarball (apt's golang-go lags releases).
RUN ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in \
       amd64) GO_ARCH=amd64 ;; \
       arm64) GO_ARCH=arm64 ;; \
       *) echo "unsupported arch $ARCH" && exit 1 ;; \
     esac \
  && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tar.gz \
  && tar -C /usr/local -xzf /tmp/go.tar.gz \
  && rm /tmp/go.tar.gz
ENV PATH=/usr/local/go/bin:/home/node/go/bin:$PATH
ENV GOPATH=/home/node/go

# git-delta for nicer diffs in the terminal.
RUN ARCH="$(dpkg --print-architecture)" \
  && curl -fsSL "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" -o /tmp/git-delta.deb \
  && dpkg -i /tmp/git-delta.deb \
  && rm /tmp/git-delta.deb

# npm-global so the node user can install Claude Code without sudo.
RUN mkdir -p /usr/local/share/npm-global && chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history across container rebuilds via a named volume mount.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R "$USERNAME" /commandhistory \
  && echo "$SNIPPET" >> /home/$USERNAME/.bashrc

# Help tooling recognise that we're inside a devcontainer.
ENV DEVCONTAINER=true

RUN mkdir -p /workspace /home/node/.claude /home/node/go \
  && chown -R node:node /workspace /home/node/.claude /home/node/go

WORKDIR /workspace

# Switch to non-root user for the rest.
USER node

ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

ENV EDITOR=nano
ENV VISUAL=nano

# Tools needed inside the container for `make sqlc-gen`, etc.
# Clean the module cache after install — sqlc's deps aren't shared with this
# project so keeping them in the image would waste ~1GB. Project deps get
# fetched fresh on first `go build` inside the container.
RUN go install "github.com/sqlc-dev/sqlc/cmd/sqlc@${SQLC_VERSION}" \
  && go clean -modcache

# uv for headroom-ai (installed at container-create time via postCreateCommand,
# not here — pypi.org is unreachable during Docker Desktop image builds).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/node/.local/bin:$PATH"

# Claude Code itself.
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

# Firewall script. The postStartCommand in devcontainer.json invokes it as root.
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh \
  && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
  && chmod 0440 /etc/sudoers.d/node-firewall
USER node
