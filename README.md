# SFTPGo Config Deploy Action

Deploys SFTPGo **Virtual Folders** and **Groups**, defined as YAML files in your repository, to a target SFTPGo server via its [REST API](./openapi.yaml).

Runs in **simulate mode by default** — it prints the plan of what would change without touching the server, so it's safe to add to a workflow and review before switching to a real deploy.

## Project layout

Point `project-path` at a directory containing `VirtualFolders/` and `Groups/` subfolders of YAML files, one artifact per file:

```
sftpgo/
├── VirtualFolders/
│   ├── data.yaml
│   └── backups.yaml
└── Groups/
    └── engineers.yaml
```

Each file's fields mirror the SFTPGo API request body (see `BaseVirtualFolder` and `Group` in [openapi.yaml](./openapi.yaml)). The artifact's identity is its `name` field, **not** the filename — this matches the [SFTPGo config VS Code extension](https://github.com/linkedupbits/sftpgo_config_extension), so files created there can be committed and deployed as-is.

```yaml
# VirtualFolders/data.yaml
name: Data Folder
description: Shared data volume
mapped_path: /srv/data
filesystem:
  provider: 0
```

```yaml
# Groups/engineers.yaml
name: engineers
description: Engineering team defaults
user_settings:
  filesystem:
    provider: 0
```

## Inputs

| Input                     | Required | Default | Description                                                                                     |
|----------------------------|----------|---------|---------------------------------------------------------------------------------------------------|
| `server-url`               | yes      |         | Base URL of the target SFTPGo server, e.g. `https://sftpgo.example.com`                          |
| `authentication-method`    | yes      |         | `username-password` or `api-key`                                                                  |
| `username`                 | if `authentication-method: username-password` |    | SFTPGo admin username                                                                              |
| `password`                 | if `authentication-method: username-password` |    | SFTPGo admin password (masked in logs)                                                            |
| `api-key`                  | if `authentication-method: api-key` |    | SFTPGo API key (masked in logs)                                                                   |
| `project-path`             | yes      |         | Path to the directory containing `VirtualFolders/` and `Groups/`, resolved relative to the workflow workspace |
| `retain-extra-artifacts`   | no       | `true`  | If `true`, artifacts on the server that aren't in the project are left alone. If `false`, they're deleted. |
| `simulate`                 | no       | `true`  | If `true`, only prints the plan — no changes are applied.                                        |

## Outputs

| Output             | Description                                                              |
|---------------------|---------------------------------------------------------------------------|
| `simulated`         | Whether the run was a simulation (no changes applied)                    |
| `folders-created`   | Number of Virtual Folders created (or that would be, in simulate mode)   |
| `folders-updated`   | Number of Virtual Folders updated (or that would be, in simulate mode)   |
| `folders-deleted`   | Number of Virtual Folders deleted (or that would be, in simulate mode)   |
| `groups-created`    | Number of Groups created (or that would be, in simulate mode)            |
| `groups-updated`    | Number of Groups updated (or that would be, in simulate mode)            |
| `groups-deleted`    | Number of Groups deleted (or that would be, in simulate mode)            |

## Examples

### Simulate a deploy on every pull request

Review the plan in the workflow log before it's ever applied.

```yaml
name: Preview SFTPGo config changes

on:
  pull_request:
    paths:
      - 'sftpgo/**'

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: linkedupbits/sftpgo_config_deploy_action@v1
        with:
          server-url: https://sftpgo.example.com
          authentication-method: api-key
          api-key: ${{ secrets.SFTPGO_API_KEY }}
          project-path: sftpgo
          # simulate defaults to true — nothing is applied
```

### Deploy on merge to main, using an API key

```yaml
name: Deploy SFTPGo config

on:
  push:
    branches: [main]
    paths:
      - 'sftpgo/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: linkedupbits/sftpgo_config_deploy_action@v1
        with:
          server-url: https://sftpgo.example.com
          authentication-method: api-key
          api-key: ${{ secrets.SFTPGO_API_KEY }}
          project-path: sftpgo
          simulate: false
```

### Deploy using admin username/password, pruning extra artifacts

With `retain-extra-artifacts: false`, any Virtual Folder or Group that exists on the server but isn't defined in the project is deleted, keeping the server an exact mirror of the repo.

```yaml
name: Deploy SFTPGo config

on:
  push:
    branches: [main]
    paths:
      - 'sftpgo/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: linkedupbits/sftpgo_config_deploy_action@v1
        with:
          server-url: https://sftpgo.example.com
          authentication-method: username-password
          username: ${{ secrets.SFTPGO_ADMIN_USERNAME }}
          password: ${{ secrets.SFTPGO_ADMIN_PASSWORD }}
          project-path: sftpgo
          retain-extra-artifacts: false
          simulate: false
```

### Using the outputs

```yaml
      - uses: linkedupbits/sftpgo_config_deploy_action@v1
        id: deploy
        with:
          server-url: https://sftpgo.example.com
          authentication-method: api-key
          api-key: ${{ secrets.SFTPGO_API_KEY }}
          project-path: sftpgo
          simulate: false

      - run: |
          echo "Folders: +${{ steps.deploy.outputs.folders-created }} ~${{ steps.deploy.outputs.folders-updated }} -${{ steps.deploy.outputs.folders-deleted }}"
          echo "Groups:  +${{ steps.deploy.outputs.groups-created }} ~${{ steps.deploy.outputs.groups-updated }} -${{ steps.deploy.outputs.groups-deleted }}"
```

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build   # bundles src/ into dist/index.js via ncc; commit the result
```
