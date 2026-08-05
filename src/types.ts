/** A parsed YAML artifact definition. Loosely typed on purpose: fields beyond
 * `name` are passed through to the SFTPGo API untouched (see artifacts/loader.ts). */
export interface LocalArtifact {
  name: string;
  [key: string]: unknown;
}

/** An artifact as returned by the SFTPGo API. Only `name` is relied upon. */
export interface RemoteArtifact {
  name: string;
  [key: string]: unknown;
}

export type ArtifactKind = 'folder' | 'group';

export interface UsernamePasswordAuth {
  method: 'username-password';
  username: string;
  password: string;
}

export interface ApiKeyAuth {
  method: 'api-key';
  apiKey: string;
}

export type AuthConfig = UsernamePasswordAuth | ApiKeyAuth;

export interface ActionInputs {
  serverUrl: string;
  auth: AuthConfig;
  projectPath: string;
  retainExtraArtifacts: boolean;
  simulate: boolean;
}
