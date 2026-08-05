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
    && rm -rf /var/lib/apt/lists/*

USER node
