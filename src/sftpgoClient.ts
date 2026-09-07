import { AuthConfig, LocalArtifact, RemoteArtifact } from './types';

export type FetchFn = typeof fetch;

const LIST_PAGE_LIMIT = 500;
const REAUTH_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SftpgoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(`SFTPGo API error ${status} on ${path}: ${message}`);
    this.name = 'SftpgoApiError';
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: string; error?: string };
    return body.message || body.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export class SftpgoClient {
  private token: string | undefined;

  constructor(
    private readonly serverUrl: string,
    private readonly auth: AuthConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async authenticate(): Promise<void> {
    if (this.auth.method === 'api-key') {
      return;
    }
    const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
    const response = await this.fetchFn(`${this.serverUrl}/api/v2/token`, {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!response.ok) {
      throw new SftpgoApiError(response.status, '/token', await extractErrorMessage(response));
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      throw new SftpgoApiError(response.status, '/token', `response was not valid JSON: ${text.slice(0, 200)}`);
    }
    const accessToken = (parsed as { access_token?: unknown } | undefined)?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new SftpgoApiError(
        response.status,
        '/token',
        `response did not include a usable 'access_token' field: ${text.slice(0, 200)}`,
      );
    }
    this.token = accessToken;
  }

  private authHeader(): Record<string, string> {
    if (this.auth.method === 'api-key') {
      return { 'X-SFTPGO-API-KEY': this.auth.apiKey };
    }
    if (!this.token) {
      throw new Error('SftpgoClient.authenticate() must be called before making authenticated requests');
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  private async request<T>(
    method: string,
    urlPath: string,
    body?: unknown,
    allowReauth = true,
  ): Promise<T | undefined> {
    const response = await this.fetchFn(`${this.serverUrl}/api/v2${urlPath}`, {
      method,
      headers: {
        ...this.authHeader(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && allowReauth && this.auth.method === 'username-password') {
      await this.authenticate();
      await delay(REAUTH_RETRY_DELAY_MS);
      return this.request<T>(method, urlPath, body, false);
    }

    if (!response.ok) {
      throw new SftpgoApiError(response.status, urlPath, await extractErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined;
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : undefined;
  }

  private async listAll(basePath: string): Promise<RemoteArtifact[]> {
    const results: RemoteArtifact[] = [];
    let offset = 0;
    for (;;) {
      const page =
        (await this.request<RemoteArtifact[]>(
          'GET',
          `${basePath}?offset=${offset}&limit=${LIST_PAGE_LIMIT}`,
        )) ?? [];
      results.push(...page);
      if (page.length < LIST_PAGE_LIMIT) {
        break;
      }
      offset += LIST_PAGE_LIMIT;
    }
    return results;
  }

  listFolders(): Promise<RemoteArtifact[]> {
    return this.listAll('/folders');
  }

  listGroups(): Promise<RemoteArtifact[]> {
    return this.listAll('/groups');
  }

  createFolder(folder: LocalArtifact): Promise<void> {
    return this.request('POST', '/folders', folder).then(() => undefined);
  }

  updateFolder(folder: LocalArtifact): Promise<void> {
    return this.request('PUT', `/folders/${encodeURIComponent(folder.name)}`, folder).then(() => undefined);
  }

  deleteFolder(name: string): Promise<void> {
    return this.request('DELETE', `/folders/${encodeURIComponent(name)}`).then(() => undefined);
  }

  createGroup(group: LocalArtifact): Promise<void> {
    return this.request('POST', '/groups', group).then(() => undefined);
  }

  updateGroup(group: LocalArtifact): Promise<void> {
    return this.request('PUT', `/groups/${encodeURIComponent(group.name)}`, group).then(() => undefined);
  }

  deleteGroup(name: string): Promise<void> {
    return this.request('DELETE', `/groups/${encodeURIComponent(name)}`).then(() => undefined);
  }
}
