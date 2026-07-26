import type {
  CompleteIterationProvisioningInput,
  FailIterationProvisioningInput,
  InboxStoryCandidateInput,
  KickoffDecisionInput,
  SelectInboxCandidateInput,
  WorkspaceIterations,
} from '@evidence/server-domain';
import type { PrismaStore } from './types';
import { PrismaWorkspaceIterations } from './workspace-iterations';
import { PrismaWorkspaceKickoff } from './workspace-kickoff';

export class PrismaWorkspaceIterationWorkflow implements WorkspaceIterations {
  private readonly iterations: PrismaWorkspaceIterations;
  private readonly kickoff: PrismaWorkspaceKickoff;

  constructor(store: PrismaStore, workspaceId: string) {
    this.iterations = new PrismaWorkspaceIterations(store, workspaceId);
    this.kickoff = new PrismaWorkspaceKickoff(store, workspaceId);
  }

  selectCandidate(input: SelectInboxCandidateInput, selectedByUserId: string) {
    return this.iterations.selectCandidate(input, selectedByUserId);
  }

  findIteration(iterationId: string) {
    return this.iterations.findIteration(iterationId);
  }

  findIntake(iterationId: string) {
    return this.iterations.findIntake(iterationId);
  }

  completeProvisioning(
    iterationId: string,
    input: CompleteIterationProvisioningInput,
  ) {
    return this.iterations.completeProvisioning(iterationId, input);
  }

  failProvisioning(iterationId: string, input: FailIterationProvisioningInput) {
    return this.iterations.failProvisioning(iterationId, input);
  }

  findKickoff(iterationId: string) {
    return this.kickoff.findKickoff(iterationId);
  }

  proposeKickoffReplacement(
    iterationId: string,
    expectedIterationVersion: number,
    proposal: InboxStoryCandidateInput,
  ) {
    return this.kickoff.proposeKickoffReplacement(
      iterationId,
      expectedIterationVersion,
      proposal,
    );
  }

  decideKickoff(
    iterationId: string,
    input: KickoffDecisionInput,
    decidedByUserId: string,
  ) {
    return this.kickoff.decideKickoff(iterationId, input, decidedByUserId);
  }
}
