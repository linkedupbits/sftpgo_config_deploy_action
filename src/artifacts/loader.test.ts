import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArtifactLoadError, loadArtifacts } from './loader';

function makeProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sftpgo-project-'));
}

function writeYaml(dir: string, fileName: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), content, 'utf8');
}

describe('loadArtifacts', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = makeProject();
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('returns empty arrays when VirtualFolders/Groups directories do not exist', () => {
    const result = loadArtifacts(projectPath);
    expect(result.folders).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it('parses valid YAML files from both directories', () => {
    writeYaml(
      path.join(projectPath, 'VirtualFolders'),
      'a.yaml',
      'name: A Virtual Folder\ndescription: test\nfilesystem:\n  provider: 0\n',
    );
    writeYaml(path.join(projectPath, 'Groups'), 'g.yml', 'name: group1\nuser_settings:\n  filesystem:\n    provider: 0\n');

    const result = loadArtifacts(projectPath);

    expect(result.folders).toEqual([
      { name: 'A Virtual Folder', description: 'test', filesystem: { provider: 0 } },
    ]);
    expect(result.groups).toEqual([{ name: 'group1', user_settings: { filesystem: { provider: 0 } } }]);
  });

  it('identifies artifacts by the name field, not the filename', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'unrelated_filename.yaml', 'name: Real Name\n');
    const result = loadArtifacts(projectPath);
    expect(result.folders[0].name).toBe('Real Name');
  });

  it('ignores non-YAML files in the directory', () => {
    const dir = path.join(projectPath, 'VirtualFolders');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'not yaml', 'utf8');
    const result = loadArtifacts(projectPath);
    expect(result.folders).toEqual([]);
  });

  it('throws with the file path when name is missing', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'bad.yaml', 'description: no name here\n');
    expect(() => loadArtifacts(projectPath)).toThrow(ArtifactLoadError);
    expect(() => loadArtifacts(projectPath)).toThrow(/bad\.yaml/);
  });

  it('throws when name is empty', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'bad.yaml', 'name: ""\n');
    expect(() => loadArtifacts(projectPath)).toThrow(/required non-empty 'name'/);
  });

  it('throws on duplicate names within the same artifact type', () => {
    writeYaml(path.join(projectPath, 'Groups'), 'g1.yaml', 'name: dup\n');
    writeYaml(path.join(projectPath, 'Groups'), 'g2.yaml', 'name: dup\n');
    expect(() => loadArtifacts(projectPath)).toThrow(/Duplicate group name 'dup'/);
  });

  it('allows the same name across different artifact types', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'f.yaml', 'name: shared\n');
    writeYaml(path.join(projectPath, 'Groups'), 'g.yaml', 'name: shared\n');
    const result = loadArtifacts(projectPath);
    expect(result.folders[0].name).toBe('shared');
    expect(result.groups[0].name).toBe('shared');
  });

  it('throws on malformed YAML', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'bad.yaml', 'name: [unclosed\n');
    expect(() => loadArtifacts(projectPath)).toThrow(/Failed to parse YAML/);
  });

  it('throws when the top-level YAML content is not a mapping', () => {
    writeYaml(path.join(projectPath, 'VirtualFolders'), 'bad.yaml', '- just\n- a\n- list\n');
    expect(() => loadArtifacts(projectPath)).toThrow(/must contain a YAML mapping/);
  });

  it('strips server-managed fields from folders', () => {
    writeYaml(
      path.join(projectPath, 'VirtualFolders'),
      'f.yaml',
      [
        'name: folder1',
        'id: 42',
        'used_quota_size: 100',
        'used_quota_files: 5',
        'last_quota_update: 1234',
        'users: [alice]',
        'mapped_path: /data',
      ].join('\n'),
    );
    const result = loadArtifacts(projectPath);
    expect(result.folders[0]).toEqual({ name: 'folder1', mapped_path: '/data' });
  });

  it('strips server-managed fields from groups', () => {
    writeYaml(
      path.join(projectPath, 'Groups'),
      'g.yaml',
      ['name: group1', 'id: 7', 'created_at: 1', 'updated_at: 2', 'users: [bob]', 'admins: [root]', 'description: desc'].join(
        '\n',
      ),
    );
    const result = loadArtifacts(projectPath);
    expect(result.groups[0]).toEqual({ name: 'group1', description: 'desc' });
  });
});
