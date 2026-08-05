import * as path from 'path';
import * as core from '@actions/core';
import { ActionInputs, AuthConfig } from './types';

const VALID_AUTH_METHODS = ['username-password', 'api-key'] as const;

export class InputValidationError extends Error {}

function resolveProjectPath(projectPath: string): string {
  const base = process.env.GITHUB_WORKSPACE || process.cwd();
  return path.isAbsolute(projectPath) ? projectPath : path.resolve(base, projectPath);
}

function readAuth(getInput: typeof core.getInput, setSecret: typeof core.setSecret): AuthConfig {
  const method = getInput('authentication-method', { required: true }).trim();

  if (method === 'username-password') {
    const username = getInput('username');
    const password = getInput('password');
    if (!username) {
      throw new InputValidationError(
        "Input 'username' is required when authentication-method is 'username-password'",
      );
    }
    if (!password) {
      throw new InputValidationError(
        "Input 'password' is required when authentication-method is 'username-password'",
      );
    }
    setSecret(password);
    return { method: 'username-password', username, password };
  }

  if (method === 'api-key') {
    const apiKey = getInput('api-key');
    if (!apiKey) {
      throw new InputValidationError("Input 'api-key' is required when authentication-method is 'api-key'");
    }
    setSecret(apiKey);
    return { method: 'api-key', apiKey };
  }

  throw new InputValidationError(
    `Input 'authentication-method' must be one of ${VALID_AUTH_METHODS.join(', ')}, got '${method}'`,
  );
}

export function getActionInputs(
  getInput: typeof core.getInput = core.getInput,
  getBooleanInput: typeof core.getBooleanInput = core.getBooleanInput,
  setSecret: typeof core.setSecret = core.setSecret,
): ActionInputs {
  const serverUrl = getInput('server-url', { required: true }).trim().replace(/\/+$/, '');
  if (!serverUrl) {
    throw new InputValidationError("Input 'server-url' is required");
  }

  const auth = readAuth(getInput, setSecret);

  const rawProjectPath = getInput('project-path', { required: true });
  if (!rawProjectPath) {
    throw new InputValidationError("Input 'project-path' is required");
  }
  const projectPath = resolveProjectPath(rawProjectPath);

  const retainExtraArtifacts = getBooleanInput('retain-extra-artifacts');
  const simulate = getBooleanInput('simulate');

  return { serverUrl, auth, projectPath, retainExtraArtifacts, simulate };
}
