import { DeployPlans, DeployResult } from './deploy';
import { buildSummaryMarkdown } from './summary';
import { LocalArtifact, RemoteArtifact } from './types';

const local = (name: string): LocalArtifact => ({ name });
const remote = (name: string): RemoteArtifact => ({ name });

const emptyPlans: DeployPlans = {
  folders: { toCreate: [], toUpdate: [], toDelete: [], retained: [] },
  groups: { toCreate: [], toUpdate: [], toDelete: [], retained: [] },
};

function result(overrides: Partial<DeployResult> = {}): DeployResult {
  return {
    simulated: true,
    counts: {
      foldersCreated: 0,
      foldersUpdated: 0,
      foldersDeleted: 0,
      groupsCreated: 0,
      groupsUpdated: 0,
      groupsDeleted: 0,
    },
    errors: [],
    ...overrides,
  };
}

describe('buildSummaryMarkdown', () => {
  it('reports no changes for both sections when everything is empty', () => {
    const markdown = buildSummaryMarkdown(emptyPlans, result());
    expect(markdown).toContain('### Virtual Folders\n\nNo changes.');
    expect(markdown).toContain('### Groups\n\nNo changes.');
  });

  it('labels simulate vs applied runs distinctly', () => {
    expect(buildSummaryMarkdown(emptyPlans, result({ simulated: true }))).toContain(
      '**Mode:** Simulated — no changes were applied',
    );
    expect(buildSummaryMarkdown(emptyPlans, result({ simulated: false }))).toContain('**Mode:** Applied');
  });

  it('renders a row per artifact across create/update/delete/retain', () => {
    const plans: DeployPlans = {
      folders: {
        toCreate: [local('new-folder')],
        toUpdate: [local('existing-folder')],
        toDelete: [remote('extra-folder')],
        retained: [remote('kept-folder')],
      },
      groups: { toCreate: [], toUpdate: [], toDelete: [], retained: [] },
    };

    const markdown = buildSummaryMarkdown(plans, result());

    expect(markdown).toContain('| Create | new-folder |');
    expect(markdown).toContain('| Update | existing-folder |');
    expect(markdown).toContain('| Delete | extra-folder |');
    expect(markdown).toContain('| Retain | kept-folder |');
  });

  it('omits the Errors section when there are no errors', () => {
    const markdown = buildSummaryMarkdown(emptyPlans, result());
    expect(markdown).not.toContain('### Errors');
  });

  it('lists errors as a bullet list when present', () => {
    const markdown = buildSummaryMarkdown(
      emptyPlans,
      result({ errors: ["Create folder 'bad': boom", "Delete group 'other': nope"] }),
    );
    expect(markdown).toContain('### Errors');
    expect(markdown).toContain("- Create folder 'bad': boom");
    expect(markdown).toContain("- Delete group 'other': nope");
  });
});
