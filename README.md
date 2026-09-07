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

### Server-managed fields

Some fields are read-only or computed by SFTPGo itself, so this action strips them from each artifact before comparing or deploying — set them and they're silently ignored, whether the file is hand-written or exported straight from the server:

| Kind             | Excluded fields                                              |
|------------------|----------------------------------------------------------------|
| Virtual Folder   | `id`, `used_quota_size`, `used_quota_files`, `last_quota_update`, `users` |
| Group            | `id`, `created_at`, `updated_at`, `users`, `admins`             |

In particular, `users` on both kinds reflects the folder/group *membership* — computed from each user's own config — not something settable on the folder or group itself. Editing it in YAML and syncing has no effect: existing memberships are left exactly as they are on the server.

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
| `write-summary`            | no       | `true`  | If `true`, writes a markdown table of planned/applied changes to the GitHub Actions job summary.  |

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

Review the plan in the workflow log before it's ever applied. `write-summary` defaults to `true`, so the plan also appears as a markdown table on the workflow run's summary page — reviewers can see exactly what would change without opening the logs.

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

### Debugging interactively in VS Code

`dist/index.js` is what actually runs in a workflow, but for local debugging it's easier to run `src/main.ts` directly with breakpoints, using `ts-node` so there's no separate compile step. A ready-made launch config is checked in at [.vscode/launch.json](.vscode/launch.json) — **Run and Debug → "Debug action (src/main.ts)"**.

Since there's no GitHub Actions runner locally, the action's inputs have to be supplied as environment variables the way the runner would set them: `@actions/core`'s `getInput()`/`getBooleanInput()` read `INPUT_<NAME>`, with the input name uppercased and spaces (not hyphens) turned into underscores — e.g. `server-url` becomes `INPUT_SERVER-URL`. Edit the `env` block in `launch.json` to point at a real (or test) SFTPGo server and a local `project-path` directory laid out as shown in [Project layout](#project-layout). `GITHUB_WORKSPACE` is set to `${workspaceFolder}` so a relative `project-path` resolves against the repo root, same as in a real workflow.

A couple of things worth knowing:
- Leave `simulate: true` (the default) unless you specifically want to debug against a real server making real changes.
- `write-summary` is set to `false` in the checked-in config to skip the job-summary write entirely; flip it to `true` only if you also create the `.debug/` directory the config points `GITHUB_STEP_SUMMARY` at (it's gitignored, and `core.summary` doesn't create parent directories itself).
- Nothing is mocked here — `SftpgoClient` uses the real `fetch`, so this is genuinely useful for reproducing environment-specific issues (like the 401s discussed above) with breakpoints in `sftpgoClient.ts`, against the actual server that's misbehaving.

## Releasing

Consumers reference this action by tag (`uses: linkedupbits/sftpgo_config_deploy_action@v1`), so releasing means tagging a commit — there's no package to publish. Each release needs an immutable version tag plus a moving major tag that consumers pin to:

```bash
git tag -a v1.0.0 -m "v1.0.0"
git tag -f v1                # moving major tag, points at the same commit
git push origin main
git push origin v1.0.0
git push origin v1 --force   # --force only needed when re-pointing an existing v1 tag
```

Then create a GitHub Release from the tag, either via `gh`:

```bash
gh release create v1.0.0 --title "v1.0.0" --notes "..."
```

or via the GitHub UI: **Releases → Draft a new release → choose tag `v1.0.0` → Publish**.

For subsequent releases (e.g. `v1.1.0`), tag as above, then re-point the major tag and force-push it so everyone pinned to `@v1` picks up the change automatically:

```bash
git tag -f v1 v1.1.0
git push origin v1 --force
```

Before tagging, make sure `dist/` is committed and in sync with `src/` (`npm run build`, then check `git status`) — the CI workflow enforces this on every push and PR, but it's worth double-checking on a release commit specifically since that's what consumers actually run.
