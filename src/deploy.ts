import { ArtifactPlan } from './plan';
import { SftpgoClient } from './sftpgoClient';
import { LocalArtifact, RemoteArtifact } from './types';

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface DeployPlans {
  folders: ArtifactPlan;
  groups: ArtifactPlan;
}

export interface DeployCounts {
  foldersCreated: number;
  foldersUpdated: number;
  foldersDeleted: number;
  groupsCreated: number;
  groupsUpdated: number;
  groupsDeleted: number;
}

export interface DeployResult {
  simulated: boolean;
  counts: DeployCounts;
  errors: string[];
}

function describe(kind: string, artifacts: LocalArtifact[] | RemoteArtifact[]): string {
  if (artifacts.length === 0) {
    return `  (none)`;
  }
  return artifacts.map((a) => `  - ${a.name}`).join('\n');
}

function logPlan(logger: Logger, plans: DeployPlans): void {
  logger.info('Virtual Folders:');
  logger.info(`Create:\n${describe('create', plans.folders.toCreate)}`);
  logger.info(`Update:\n${describe('update', plans.folders.toUpdate)}`);
  logger.info(`Delete:\n${describe('delete', plans.folders.toDelete)}`);
  if (plans.folders.retained.length > 0) {
    logger.info(`Retained (present on server, not in project):\n${describe('retain', plans.folders.retained)}`);
  }
  logger.info('Groups:');
  logger.info(`Create:\n${describe('create', plans.groups.toCreate)}`);
  logger.info(`Update:\n${describe('update', plans.groups.toUpdate)}`);
  logger.info(`Delete:\n${describe('delete', plans.groups.toDelete)}`);
  if (plans.groups.retained.length > 0) {
    logger.info(`Retained (present on server, not in project):\n${describe('retain', plans.groups.retained)}`);
  }
}

function countsFromPlans(plans: DeployPlans): DeployCounts {
  return {
    foldersCreated: plans.folders.toCreate.length,
    foldersUpdated: plans.folders.toUpdate.length,
    foldersDeleted: plans.folders.toDelete.length,
    groupsCreated: plans.groups.toCreate.length,
    groupsUpdated: plans.groups.toUpdate.length,
    groupsDeleted: plans.groups.toDelete.length,
  };
}

async function runStep<T extends { name: string }>(
  items: T[],
  action: (item: T) => Promise<void>,
  describeAction: string,
  logger: Logger,
  errors: string[],
): Promise<number> {
  let succeeded = 0;
  for (const item of items) {
    try {
      await action(item);
      logger.info(`${describeAction}: ${item.name}`);
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to ${describeAction.toLowerCase()} '${item.name}': ${message}`);
      errors.push(`${describeAction} '${item.name}': ${message}`);
    }
  }
  return succeeded;
}

export async function deploy(
  client: SftpgoClient,
  plans: DeployPlans,
  simulate: boolean,
  logger: Logger,
): Promise<DeployResult> {
  logPlan(logger, plans);

  if (simulate) {
    logger.info('Simulate mode: no changes were applied.');
    return { simulated: true, counts: countsFromPlans(plans), errors: [] };
  }

  const errors: string[] = [];

  const foldersCreated = await runStep(plans.folders.toCreate, (f) => client.createFolder(f), 'Create folder', logger, errors);
  const foldersUpdated = await runStep(plans.folders.toUpdate, (f) => client.updateFolder(f), 'Update folder', logger, errors);

  const groupsCreated = await runStep(plans.groups.toCreate, (g) => client.createGroup(g), 'Create group', logger, errors);
  const groupsUpdated = await runStep(plans.groups.toUpdate, (g) => client.updateGroup(g), 'Update group', logger, errors);

  const groupsDeleted = await runStep(
    plans.groups.toDelete,
    (g) => client.deleteGroup(g.name),
    'Delete group',
    logger,
    errors,
  );
  const foldersDeleted = await runStep(
    plans.folders.toDelete,
    (f) => client.deleteFolder(f.name),
    'Delete folder',
    logger,
    errors,
  );

  return {
    simulated: false,
    counts: {
      foldersCreated,
      foldersUpdated,
      foldersDeleted,
      groupsCreated,
      groupsUpdated,
      groupsDeleted,
    },
    errors,
  };
}
