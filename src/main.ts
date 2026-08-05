import * as core from '@actions/core';
import { loadArtifacts } from './artifacts/loader';
import { deploy, DeployCounts } from './deploy';
import { getActionInputs } from './inputs';
import { buildPlan } from './plan';
import { SftpgoClient } from './sftpgoClient';
import { buildSummaryMarkdown } from './summary';

function setOutputs(counts: DeployCounts, simulated: boolean): void {
  core.setOutput('simulated', String(simulated));
  core.setOutput('folders-created', String(counts.foldersCreated));
  core.setOutput('folders-updated', String(counts.foldersUpdated));
  core.setOutput('folders-deleted', String(counts.foldersDeleted));
  core.setOutput('groups-created', String(counts.groupsCreated));
  core.setOutput('groups-updated', String(counts.groupsUpdated));
  core.setOutput('groups-deleted', String(counts.groupsDeleted));
}

export async function run(): Promise<void> {
  try {
    const inputs = getActionInputs();

    core.info(`Loading artifacts from ${inputs.projectPath}`);
    const local = loadArtifacts(inputs.projectPath);
    core.info(`Found ${local.folders.length} Virtual Folder(s) and ${local.groups.length} Group(s) in project`);

    const client = new SftpgoClient(inputs.serverUrl, inputs.auth);
    await client.authenticate();

    const [remoteFolders, remoteGroups] = await Promise.all([client.listFolders(), client.listGroups()]);

    const plans = {
      folders: buildPlan(local.folders, remoteFolders, inputs.retainExtraArtifacts),
      groups: buildPlan(local.groups, remoteGroups, inputs.retainExtraArtifacts),
    };

    const result = await deploy(client, plans, inputs.simulate, core);
    setOutputs(result.counts, result.simulated);

    if (inputs.writeSummary) {
      await core.summary.addRaw(buildSummaryMarkdown(plans, result)).write();
    }

    if (result.errors.length > 0) {
      core.setFailed(`${result.errors.length} artifact(s) failed to deploy:\n${result.errors.join('\n')}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.setFailed(message);
  }
}

/* istanbul ignore next */
if (require.main === module) {
  void run();
}
