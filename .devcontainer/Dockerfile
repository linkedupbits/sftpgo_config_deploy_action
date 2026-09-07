# Elastic Source Manager - VS Code extension development container.
# Matches the Node.js version this project is developed/tested against locally.
FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

USER root

# libsecret headers are required to build keytar's native module - a transitive dependency
# of @vscode/vsce (used for `vsce login`/`vsce publish` credential storage). Not needed for
# `npm run compile`/`npm test`/`npm run package`, but avoids an install-time build failure.
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends libsecret-1-dev ncat \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/* \
    && (type -p wget >/dev/null || (apt update && apt install wget -y)) \
	&& mkdir -p -m 755 /etc/apt/keyrings \
	&& out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
	&& cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
	&& chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
	&& mkdir -p -m 755 /etc/apt/sources.list.d \
	&& "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
	&& apt update \
	&& apt install gh -y

USER node
