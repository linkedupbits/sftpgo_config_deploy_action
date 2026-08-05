import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ArtifactKind, LocalArtifact } from '../types';

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

const SERVER_MANAGED_FIELDS: Record<ArtifactKind, string[]> = {
  folder: ['id', 'used_quota_size', 'used_quota_files', 'last_quota_update', 'users'],
  group: ['id', 'created_at', 'updated_at', 'users', 'admins'],
};

export class ArtifactLoadError extends Error {}

function listYamlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && YAML_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function stripServerManagedFields(artifact: LocalArtifact, kind: ArtifactKind): LocalArtifact {
  const stripped: LocalArtifact = { ...artifact };
  for (const field of SERVER_MANAGED_FIELDS[kind]) {
    delete stripped[field];
  }
  return stripped;
}

function loadArtifactsFromDir(dir: string, kind: ArtifactKind): LocalArtifact[] {
  const artifacts: LocalArtifact[] = [];
  const seenNames = new Map<string, string>();

  for (const filePath of listYamlFiles(dir)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ArtifactLoadError(`Failed to parse YAML in ${filePath}: ${message}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ArtifactLoadError(`${filePath} must contain a YAML mapping (object) at the top level`);
    }

    const candidate = parsed as Record<string, unknown>;
    const name = candidate.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ArtifactLoadError(`${filePath} is missing a required non-empty 'name' field`);
    }

    if (seenNames.has(name)) {
      throw new ArtifactLoadError(
        `Duplicate ${kind} name '${name}' found in ${filePath} and ${seenNames.get(name)}`,
      );
    }
    seenNames.set(name, filePath);

    artifacts.push(stripServerManagedFields(candidate as LocalArtifact, kind));
  }

  return artifacts;
}

export interface LoadedArtifacts {
  folders: LocalArtifact[];
  groups: LocalArtifact[];
}

export function loadArtifacts(projectPath: string): LoadedArtifacts {
  return {
    folders: loadArtifactsFromDir(path.join(projectPath, 'VirtualFolders'), 'folder'),
    groups: loadArtifactsFromDir(path.join(projectPath, 'Groups'), 'group'),
  };
}
