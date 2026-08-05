# Overview

This project is a GitHub Action that deploys SFTPGo administration artifacts (Virtual Folders and Groups) to an SFTPGo server via its API, defined as YAML files in a project directory.

It uses the [SFTPGo OpenAPI Spec](./openapi.yaml) to push changes to the target server.

**Status: implemented.** See [README.md](./README.md) for usage, inputs/outputs, and example workflows.

## Original spec

The Action has these configuration options:
* Server URL (string as URL)
* Authentication Method (Username/password or API Key) (determines other required options)
  * Username/password:
    * Username (string)
    * Password (secure string - masked from Github output)
  * API Key:
    * API Key Value (secure string - masked from Github output)
* Project Path (string)
* Retain extra Artifacts (Boolean, optional, default True)
* Simulate (Boolean, optional, default True)

It deploys these SFTPGo artifacts:
* Virtual Folders (YAML files in a VirtualFolders folder in the root of the Project Path)
* Groups (YAML files in a Groups folder in the root of the Project Path)

The definition of the values to post to the API is stored as YAML. Refer to the VS Code extension that masters these artifacts [VS Code Sftpgo config extension](https://github.com/linkedupbits/sftpgo_config_extension) if there are questions about how they are serialised/structured.

Since this original spec, a `write-summary` option was added (Boolean, default True) that writes a markdown table of the plan/results to the GitHub Actions job summary.

## Implementation notes (learned while building)

- **Packaging**: TypeScript action, `runs: using: node24`, bundled with `@vercel/ncc` into a committed `dist/index.js`. CI (`.github/workflows/ci.yml`) verifies `dist/` stays in sync with `src/` on every push/PR — always run `npm run build` after source changes and commit the result.
- **YAML schema**: files under `VirtualFolders/` and `Groups/` mirror the OpenAPI request-body JSON field names directly (snake_case) — confirmed against the [SFTPGo config VS Code extension](https://github.com/linkedupbits/sftpgo_config_extension)'s sample files (`Sample_Project/`) and its `src/yaml/yamlSerializer.ts`, which prunes empty/undefined fields the same way this action's loader expects.
- **Artifact identity is the `name` field inside the YAML, not the filename** — e.g. `A_Virtual_Folder.yaml` can contain `name: A Virtual Folder`. `src/artifacts/loader.ts` keys everything off `name` and enforces uniqueness per artifact type.
- Local artifacts are loosely typed (`Record<string, unknown> & { name: string }`) rather than modeling the full OpenAPI schema in TypeScript — everything except a small deny-list of server-managed fields is stripped and the rest is passed through untouched to the API:
  - Folders: `id`, `used_quota_size`, `used_quota_files`, `last_quota_update`, `users`
  - Groups: `id`, `created_at`, `updated_at`, `users`, `admins`
- **Update semantics**: when an artifact exists both locally and remotely, the action always PUTs it rather than diffing fields first — a deliberate choice to avoid false "changed" noise from server-computed fields (quota usage, timestamps, filesystem defaults) that never appear in hand-authored YAML. See `src/plan.ts`.
- **Dependency-safe ordering** in `src/deploy.ts`: folders are created/updated before groups (groups reference folders by name), and on deletion (only when `retain-extra-artifacts: false`) groups are removed before folders.
- Auth: username/password exchanges Basic credentials for a bearer token via `GET /token`; API key auth sends `X-SFTPGO-API-KEY` directly, no token exchange needed. See `src/sftpgoClient.ts`.
- `core.summary` (used for `write-summary`) requires `$GITHUB_STEP_SUMMARY` to be set to a writable file — only matters when the input is `true`; skipping the summary write when `false` needs no such env var, verified via a local smoke test.
- No live SFTPGo server is available in this dev environment — the client is unit-tested against mocked HTTP responses, and end-to-end wiring is spot-checked by running the built `dist/index.js` against a small local Node HTTP server standing in for the SFTPGo API.

## Repo layout

- `action.yml` — Action metadata/inputs/outputs
- `src/` — TypeScript source (`main.ts` entrypoint; `inputs.ts`, `artifacts/loader.ts`, `sftpgoClient.ts`, `plan.ts`, `deploy.ts`, `summary.ts`), each with a colocated `*.test.ts`
- `dist/` — ncc-bundled output, committed (required for the action to run — see packaging note above)
- `.github/workflows/ci.yml` — typecheck, test, build, dist-in-sync check
- `README.md` — user-facing usage docs, examples, and the release process
- `openapi.yaml` — SFTPGo's API spec (source of truth for the `/folders` and `/groups` endpoints and schemas)
