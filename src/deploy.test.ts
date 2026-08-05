import { deploy, DeployPlans, Logger } from './deploy';
import { SftpgoClient } from './sftpgoClient';
import { LocalArtifact, RemoteArtifact } from './types';

function silentLogger(): Logger {
  return { info: jest.fn(), warning: jest.fn(), error: jest.fn() };
}

function makeClient(overrides: Partial<jest.Mocked<SftpgoClient>> = {}): jest.Mocked<SftpgoClient> {
  return {
    authenticate: jest.fn(),
    listFolders: jest.fn(),
    listGroups: jest.fn(),
    createFolder: jest.fn().mockResolvedValue(undefined),
    updateFolder: jest.fn().mockResolvedValue(undefined),
    deleteFolder: jest.fn().mockResolvedValue(undefined),
    createGroup: jest.fn().mockResolvedValue(undefined),
    updateGroup: jest.fn().mockResolvedValue(undefined),
    deleteGroup: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<SftpgoClient>;
}

const local = (name: string): LocalArtifact => ({ name });
const remote = (name: string): RemoteArtifact => ({ name });

describe('deploy', () => {
  it('makes zero mutating calls in simulate mode', async () => {
    const client = makeClient();
    const plans: DeployPlans = {
      folders: { toCreate: [local('f-new')], toUpdate: [local('f-existing')], toDelete: [remote('f-extra')], retained: [] },
      groups: { toCreate: [local('g-new')], toUpdate: [], toDelete: [], retained: [] },
    };

    const result = await deploy(client, plans, true, silentLogger());

    expect(client.createFolder).not.toHaveBeenCalled();
    expect(client.updateFolder).not.toHaveBeenCalled();
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(client.createGroup).not.toHaveBeenCalled();
    expect(result.simulated).toBe(true);
    expect(result.counts).toEqual({
      foldersCreated: 1,
      foldersUpdated: 1,
      foldersDeleted: 1,
      groupsCreated: 1,
      groupsUpdated: 0,
      groupsDeleted: 0,
    });
    expect(result.errors).toEqual([]);
  });

  it('executes changes in folders-create/update -> groups-create/update -> groups-delete -> folders-delete order', async () => {
    const client = makeClient();
    const callOrder: string[] = [];
    client.createFolder.mockImplementation(async () => {
      callOrder.push('createFolder');
    });
    client.updateFolder.mockImplementation(async () => {
      callOrder.push('updateFolder');
    });
    client.deleteFolder.mockImplementation(async () => {
      callOrder.push('deleteFolder');
    });
    client.createGroup.mockImplementation(async () => {
      callOrder.push('createGroup');
    });
    client.updateGroup.mockImplementation(async () => {
      callOrder.push('updateGroup');
    });
    client.deleteGroup.mockImplementation(async () => {
      callOrder.push('deleteGroup');
    });

    const plans: DeployPlans = {
      folders: { toCreate: [local('f-new')], toUpdate: [local('f-existing')], toDelete: [remote('f-extra')], retained: [] },
      groups: { toCreate: [local('g-new')], toUpdate: [local('g-existing')], toDelete: [remote('g-extra')], retained: [] },
    };

    const result = await deploy(client, plans, false, silentLogger());

    expect(callOrder).toEqual([
      'createFolder',
      'updateFolder',
      'createGroup',
      'updateGroup',
      'deleteGroup',
      'deleteFolder',
    ]);
    expect(result.simulated).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('never deletes when retainExtraArtifacts produced an empty toDelete list', async () => {
    const client = makeClient();
    const plans: DeployPlans = {
      folders: { toCreate: [], toUpdate: [], toDelete: [], retained: [remote('kept')] },
      groups: { toCreate: [], toUpdate: [], toDelete: [], retained: [] },
    };

    await deploy(client, plans, false, silentLogger());

    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(client.deleteGroup).not.toHaveBeenCalled();
  });

  it('collects per-item errors without aborting remaining items, and reports them', async () => {
    const client = makeClient();
    client.createFolder.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);

    const plans: DeployPlans = {
      folders: { toCreate: [local('bad'), local('good')], toUpdate: [], toDelete: [], retained: [] },
      groups: { toCreate: [], toUpdate: [], toDelete: [], retained: [] },
    };

    const result = await deploy(client, plans, false, silentLogger());

    expect(client.createFolder).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/bad/);
    expect(result.errors[0]).toMatch(/boom/);
    expect(result.counts.foldersCreated).toBe(1);
  });
});
