import { LocalArtifact, RemoteArtifact } from './types';

export interface ArtifactPlan {
  toCreate: LocalArtifact[];
  toUpdate: LocalArtifact[];
  toDelete: RemoteArtifact[];
  retained: RemoteArtifact[];
}

export function buildPlan(
  local: LocalArtifact[],
  remote: RemoteArtifact[],
  retainExtraArtifacts: boolean,
): ArtifactPlan {
  const remoteByName = new Map(remote.map((artifact) => [artifact.name, artifact]));
  const localNames = new Set(local.map((artifact) => artifact.name));

  const toCreate = local.filter((artifact) => !remoteByName.has(artifact.name));
  const toUpdate = local.filter((artifact) => remoteByName.has(artifact.name));

  const extras = remote.filter((artifact) => !localNames.has(artifact.name));
  const toDelete = retainExtraArtifacts ? [] : extras;
  const retained = retainExtraArtifacts ? extras : [];

  return { toCreate, toUpdate, toDelete, retained };
}
