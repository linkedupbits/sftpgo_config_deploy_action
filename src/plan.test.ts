import { buildPlan } from './plan';
import { LocalArtifact, RemoteArtifact } from './types';

const local = (name: string, extra: Record<string, unknown> = {}): LocalArtifact => ({ name, ...extra });
const remote = (name: string, extra: Record<string, unknown> = {}): RemoteArtifact => ({ name, ...extra });

describe('buildPlan', () => {
  it('marks local-only artifacts for creation', () => {
    const plan = buildPlan([local('a'), local('b')], [], true);
    expect(plan.toCreate.map((a) => a.name)).toEqual(['a', 'b']);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.retained).toEqual([]);
  });

  it('marks artifacts present both locally and remotely for update, regardless of field differences', () => {
    const plan = buildPlan([local('a', { description: 'new' })], [remote('a', { description: 'old' })], true);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate.map((a) => a.name)).toEqual(['a']);
  });

  it('retains remote-only artifacts when retainExtraArtifacts is true', () => {
    const plan = buildPlan([], [remote('orphan')], true);
    expect(plan.toDelete).toEqual([]);
    expect(plan.retained.map((a) => a.name)).toEqual(['orphan']);
  });

  it('deletes remote-only artifacts when retainExtraArtifacts is false', () => {
    const plan = buildPlan([], [remote('orphan')], false);
    expect(plan.toDelete.map((a) => a.name)).toEqual(['orphan']);
    expect(plan.retained).toEqual([]);
  });

  it('handles a full mix of create/update/retain/delete simultaneously', () => {
    const plan = buildPlan(
      [local('keep'), local('new')],
      [remote('keep'), remote('gone')],
      false,
    );
    expect(plan.toCreate.map((a) => a.name)).toEqual(['new']);
    expect(plan.toUpdate.map((a) => a.name)).toEqual(['keep']);
    expect(plan.toDelete.map((a) => a.name)).toEqual(['gone']);
    expect(plan.retained).toEqual([]);
  });

  it('returns empty plan when both local and remote are empty', () => {
    const plan = buildPlan([], [], true);
    expect(plan).toEqual({ toCreate: [], toUpdate: [], toDelete: [], retained: [] });
  });
});
