import * as path from 'path';
import { getActionInputs, InputValidationError } from './inputs';

function fakeGetInput(values: Record<string, string>): (name: string) => string {
  return (name) => values[name] ?? '';
}

function fakeGetBooleanInput(values: Record<string, boolean>): (name: string) => boolean {
  return (name) => values[name];
}

const baseValues = {
  'server-url': 'https://sftpgo.example.com/',
  'authentication-method': 'username-password',
  username: 'admin',
  password: 'hunter2',
  'project-path': 'config',
};

const baseBooleans = { 'retain-extra-artifacts': true, simulate: true, 'write-summary': true };

describe('getActionInputs', () => {
  const originalWorkspace = process.env.GITHUB_WORKSPACE;

  afterEach(() => {
    process.env.GITHUB_WORKSPACE = originalWorkspace;
  });

  it('parses a valid username/password configuration and masks the password', () => {
    process.env.GITHUB_WORKSPACE = '/workspace';
    const setSecret = jest.fn();
    const inputs = getActionInputs(
      fakeGetInput(baseValues),
      fakeGetBooleanInput(baseBooleans),
      setSecret,
    );

    expect(inputs.serverUrl).toBe('https://sftpgo.example.com');
    expect(inputs.auth).toEqual({ method: 'username-password', username: 'admin', password: 'hunter2' });
    expect(inputs.projectPath).toBe(path.resolve('/workspace', 'config'));
    expect(inputs.retainExtraArtifacts).toBe(true);
    expect(inputs.simulate).toBe(true);
    expect(inputs.writeSummary).toBe(true);
    expect(setSecret).toHaveBeenCalledWith('hunter2');
  });

  it('parses a valid api-key configuration and masks the key', () => {
    const setSecret = jest.fn();
    const inputs = getActionInputs(
      fakeGetInput({ ...baseValues, 'authentication-method': 'api-key', 'api-key': 'the-key', username: '', password: '' }),
      fakeGetBooleanInput({ 'retain-extra-artifacts': false, simulate: false, 'write-summary': false }),
      setSecret,
    );

    expect(inputs.auth).toEqual({ method: 'api-key', apiKey: 'the-key' });
    expect(inputs.writeSummary).toBe(false);
    expect(setSecret).toHaveBeenCalledWith('the-key');
  });

  it('resolves an absolute project-path as-is', () => {
    const inputs = getActionInputs(
      fakeGetInput({ ...baseValues, 'project-path': '/abs/config' }),
      fakeGetBooleanInput(baseBooleans),
      jest.fn(),
    );
    expect(inputs.projectPath).toBe('/abs/config');
  });

  it('rejects an unknown authentication-method', () => {
    expect(() =>
      getActionInputs(
        fakeGetInput({ ...baseValues, 'authentication-method': 'oauth' }),
        fakeGetBooleanInput(baseBooleans),
        jest.fn(),
      ),
    ).toThrow(InputValidationError);
  });

  it('requires username and password for username-password auth', () => {
    expect(() =>
      getActionInputs(
        fakeGetInput({ ...baseValues, username: '' }),
        fakeGetBooleanInput(baseBooleans),
        jest.fn(),
      ),
    ).toThrow(/'username' is required/);

    expect(() =>
      getActionInputs(
        fakeGetInput({ ...baseValues, password: '' }),
        fakeGetBooleanInput(baseBooleans),
        jest.fn(),
      ),
    ).toThrow(/'password' is required/);
  });

  it('requires api-key for api-key auth', () => {
    expect(() =>
      getActionInputs(
        fakeGetInput({ ...baseValues, 'authentication-method': 'api-key' }),
        fakeGetBooleanInput(baseBooleans),
        jest.fn(),
      ),
    ).toThrow(/'api-key' is required/);
  });

  it('requires a non-empty server-url', () => {
    expect(() =>
      getActionInputs(
        fakeGetInput({ ...baseValues, 'server-url': '' }),
        fakeGetBooleanInput(baseBooleans),
        jest.fn(),
      ),
    ).toThrow(/'server-url' is required/);
  });
});
