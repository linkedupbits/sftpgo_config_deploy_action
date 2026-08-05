import { DeployPlans, DeployResult } from './deploy';
import { ArtifactPlan } from './plan';
import { LocalArtifact, RemoteArtifact } from './types';

function rows(action: string, artifacts: (LocalArtifact | RemoteArtifact)[]): string[] {
  return artifacts.map((artifact) => `| ${action} | ${artifact.name} |`);
}

function artifactTable(plan: ArtifactPlan): string {
  const lines = [
    ...rows('Create', plan.toCreate),
    ...rows('Update', plan.toUpdate),
    ...rows('Delete', plan.toDelete),
    ...rows('Retain', plan.retained),
  ];
  if (lines.length === 0) {
    return 'No changes.';
  }
  return ['| Action | Name |', '| --- | --- |', ...lines].join('\n');
}

export function buildSummaryMarkdown(plans: DeployPlans, result: DeployResult): string {
  const mode = result.simulated ? 'Simulated — no changes were applied' : 'Applied';

  const lines: string[] = [
    '## SFTPGo Config Deploy',
    '',
    `**Mode:** ${mode}`,
    '',
    '### Virtual Folders',
    '',
    artifactTable(plans.folders),
    '',
    '### Groups',
    '',
    artifactTable(plans.groups),
  ];

  if (result.errors.length > 0) {
    lines.push('', '### Errors', '', ...result.errors.map((error) => `- ${error}`));
  }

  return lines.join('\n') + '\n';
}
