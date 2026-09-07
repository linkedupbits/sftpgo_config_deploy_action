import { SftpgoApiError, SftpgoClient } from './sftpgoClient';
import { AuthConfig } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status = 200): Response {
  return new Response('', { status });
}

const userPassAuth: AuthConfig = { method: 'username-password', username: 'admin', password: 'secret' };
const apiKeyAuth: AuthConfig = { method: 'api-key', apiKey: 'the-key' };

// SftpgoClient waits between re-authenticating and retrying a 401 (and briefly after every
// authenticate()). Tests don't want to actually wait, so inject a no-op delay instead of relying
// on jest fake timers, which is fragile to line up around every current and future await delayFn(...).
async function noDelay(): Promise<void> {}

describe('SftpgoClient', () => {
  describe('authenticate', () => {
    it('exchanges basic credentials for a bearer token', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token' }));
      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn, noDelay);

      await client.authenticate();

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe('https://sftpgo.example.com/api/v2/token');
      const expectedAuth = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      expect((options.headers as Record<string, string>).Authorization).toBe(expectedAuth);

      // subsequent requests should use the bearer token
      fetchFn.mockResolvedValueOnce(jsonResponse([]));
      await client.listFolders();
      const listCall = fetchFn.mock.calls[1];
      expect((listCall[1].headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    });

    it('makes no HTTP call for api-key auth and sends the key header on requests', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse([]));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);

      await client.authenticate();
      expect(fetchFn).not.toHaveBeenCalled();

      await client.listFolders();
      const [, options] = fetchFn.mock.calls[0];
      expect((options.headers as Record<string, string>)['X-SFTPGO-API-KEY']).toBe('the-key');
    });

    it('throws SftpgoApiError when the token request fails', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ message: 'invalid credentials' }, 401));
      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn);

      await expect(client.authenticate()).rejects.toThrow(SftpgoApiError);
      await expect(client.authenticate()).rejects.toThrow(/invalid credentials/);
    });

    it('throws SftpgoApiError when the token response has no access_token field', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ expires_at: '2099-01-01T00:00:00Z' }));
      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn);

      const err = await client.authenticate().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SftpgoApiError);
      expect((err as Error).message).toMatch(/did not include a usable 'access_token'/);
    });

    it('throws SftpgoApiError when access_token is present but empty or the wrong type', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ access_token: '' }));
      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn);

      await expect(client.authenticate()).rejects.toThrow(/did not include a usable 'access_token'/);
    });

    it('throws SftpgoApiError with a body snippet when the token response is not JSON', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(new Response('<html>not json</html>', { status: 200 }));
      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn);

      const err = await client.authenticate().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SftpgoApiError);
      expect((err as Error).message).toMatch(/was not valid JSON/);
    });
  });

  describe('401 re-authentication', () => {
    it('re-authenticates and retries once on a 401 for username-password auth', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token-1' })) // initial authenticate()
        .mockResolvedValueOnce(jsonResponse({ message: 'missing jwt' }, 401)) // first list attempt
        .mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token-2' })) // re-authenticate()
        .mockResolvedValueOnce(jsonResponse([{ name: 'folder-1' }])); // retried list attempt
      const delayFn = jest.fn(noDelay);

      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn, delayFn);
      await client.authenticate();

      const folders = await client.listFolders();

      expect(folders).toEqual([{ name: 'folder-1' }]);
      expect(fetchFn).toHaveBeenCalledTimes(4);
      const retriedCall = fetchFn.mock.calls[3];
      expect((retriedCall[1].headers as Record<string, string>).Authorization).toBe('Bearer jwt-token-2');
      // delayFn is called after every successful authenticate() (initial + reauth) and once more
      // before the retried request.
      expect(delayFn.mock.calls).toEqual([[500], [500], [300]]);
    });

    it('does not retry a second time if the retried request also 401s', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token-1' }))
        .mockResolvedValueOnce(jsonResponse({ message: 'missing jwt' }, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token-2' }))
        .mockResolvedValueOnce(jsonResponse({ message: 'missing jwt' }, 401));

      const client = new SftpgoClient('https://sftpgo.example.com', userPassAuth, fetchFn, noDelay);
      await client.authenticate();

      await expect(client.listFolders()).rejects.toThrow(SftpgoApiError);
      expect(fetchFn).toHaveBeenCalledTimes(4);
    });

    it('does not retry on 401 for api-key auth', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ message: 'invalid api key' }, 401));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);

      await expect(client.listFolders()).rejects.toThrow(SftpgoApiError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('listFolders / listGroups pagination', () => {
    it('follows pagination until a short page is returned', async () => {
      const page1 = Array.from({ length: 500 }, (_, i) => ({ name: `folder-${i}` }));
      const page2 = [{ name: 'folder-last' }];
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(page1))
        .mockResolvedValueOnce(jsonResponse(page2));

      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);
      const folders = await client.listFolders();

      expect(folders).toHaveLength(501);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(fetchFn.mock.calls[0][0]).toContain('offset=0');
      expect(fetchFn.mock.calls[1][0]).toContain('offset=500');
    });

    it('stops after a single short page', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse([{ name: 'only-one' }]));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);
      const groups = await client.listGroups();
      expect(groups).toEqual([{ name: 'only-one' }]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('mutating calls', () => {
    it('createFolder POSTs to /folders with the artifact body', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ name: 'f1' }, 201));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);
      await client.createFolder({ name: 'f1', mapped_path: '/data' });

      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe('https://sftpgo.example.com/api/v2/folders');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({ name: 'f1', mapped_path: '/data' });
    });

    it('updateFolder PUTs to /folders/{name}', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ message: 'ok' }));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);
      await client.updateFolder({ name: 'f 1' });

      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe('https://sftpgo.example.com/api/v2/folders/f%201');
      expect(options.method).toBe('PUT');
    });

    it('deleteGroup DELETEs to /groups/{name}', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(emptyResponse(200));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);
      await client.deleteGroup('g1');

      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe('https://sftpgo.example.com/api/v2/groups/g1');
      expect(options.method).toBe('DELETE');
    });

    it('throws SftpgoApiError with the API message on failure', async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce(jsonResponse({ message: 'folder in use' }, 500));
      const client = new SftpgoClient('https://sftpgo.example.com', apiKeyAuth, fetchFn);

      await expect(client.deleteFolder('f1')).rejects.toThrow(/folder in use/);
    });
  });
});
