import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  DomainError,
  type DeskCheckAction,
  type ProposeTaskingInput,
  type TaskingFunctionalContext,
  type TaskingTechnicalBoundary,
} from '@evidence/server-domain';
import {
  deskCheckDecisionResultModel,
  noModelImpactDecisionModel,
  taskingCandidateModel,
  taskingModel,
} from './model/tasking-model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class TaskingController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId/tasking')
  async getTasking(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.tasking().findTasking(iterationId);
    if (!view) throw DomainError.notFound(`Tasking ${iterationId} not found`);
    return taskingModel(workspaceId, view);
  }

  @Post(':iterationId/tasking/no-model-impact')
  @HttpCode(HttpStatus.CREATED)
  async recordNoModelImpact(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return noModelImpactDecisionModel(
      workspaceId,
      await workspace.tasking().recordNoModelImpact(
        iterationId,
        {
          expectedIterationVersion: positive(
            body.expectedIterationVersion,
            'expectedIterationVersion',
          ),
          storyId: text(body.storyId, 'storyId'),
          storyRevisionId: text(body.storyRevisionId, 'storyRevisionId'),
          storyRevisionSha256: text(
            body.storyRevisionSha256,
            'storyRevisionSha256',
          ),
          reason: text(body.reason, 'reason'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post(':iterationId/tasking/candidates')
  @HttpCode(HttpStatus.CREATED)
  async proposeCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return taskingCandidateModel(
      workspaceId,
      await workspace
        .tasking()
        .proposeTasking(iterationId, taskingInput(record(value))),
    );
  }

  @Post(':iterationId/tasking/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return deskCheckDecisionResultModel(
      workspaceId,
      await workspace.tasking().decideTasking(
        iterationId,
        {
          expectedIterationVersion: positive(
            body.expectedIterationVersion,
            'expectedIterationVersion',
          ),
          candidateId: text(body.candidateId, 'candidateId'),
          candidateSha256: text(body.candidateSha256, 'candidateSha256'),
          action: deskCheckAction(body.action),
          reason: optionalText(body.reason, 'reason'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }
}

function taskingInput(body: Record<string, unknown>): ProposeTaskingInput {
  const projectCatalog = record(body.projectCatalog, 'projectCatalog');
  return {
    expectedIterationVersion: positive(
      body.expectedIterationVersion,
      'expectedIterationVersion',
    ),
    storyId: text(body.storyId, 'storyId'),
    storyRevisionId: text(body.storyRevisionId, 'storyRevisionId'),
    noModelImpactDecisionId: text(
      body.noModelImpactDecisionId,
      'noModelImpactDecisionId',
    ),
    noModelImpactDecisionSha256: text(
      body.noModelImpactDecisionSha256,
      'noModelImpactDecisionSha256',
    ),
    projectCatalog: {
      projects: array(projectCatalog.projects, 'projectCatalog.projects').map(
        (entry, index) => {
          const name = `projectCatalog.projects[${String(index)}]`;
          const project = record(entry, name);
          return {
            id: text(project.id, `${name}.id`),
            root: text(project.root, `${name}.root`),
            targets: strings(project.targets, `${name}.targets`),
          };
        },
      ),
    },
    runtimes: array(body.runtimes, 'runtimes').map((entry, index) => {
      const name = `runtimes[${String(index)}]`;
      const runtime = record(entry, name);
      return {
        id: text(runtime.id, `${name}.id`),
        runtime: typescript(runtime.runtime, `${name}.runtime`),
        functionalContexts: strings(
          runtime.functionalContexts,
          `${name}.functionalContexts`,
        ) as TaskingFunctionalContext[],
        technicalBoundaries: strings(
          runtime.technicalBoundaries,
          `${name}.technicalBoundaries`,
        ) as TaskingTechnicalBoundary[],
        projectIds: strings(runtime.projectIds, `${name}.projectIds`),
      };
    }),
    tests: array(body.tests, 'tests').map((entry, index) => {
      const name = `tests[${String(index)}]`;
      const test = record(entry, name);
      const modelRefs = record(test.modelRefs, `${name}.modelRefs`);
      return {
        id: text(test.id, `${name}.id`),
        quadrant: quadrant(test.quadrant, `${name}.quadrant`),
        intent: text(test.intent, `${name}.intent`),
        runtimePlanId: text(test.runtimePlanId, `${name}.runtimePlanId`),
        stepId: text(test.stepId, `${name}.stepId`),
        projectId: optionalText(test.projectId, `${name}.projectId`),
        testFilter: text(test.testFilter, `${name}.testFilter`),
        supportedBy: strings(test.supportedBy, `${name}.supportedBy`),
        scenarioIds: strings(test.scenarioIds, `${name}.scenarioIds`),
        scenarioOutcome: optionalText(
          test.scenarioOutcome,
          `${name}.scenarioOutcome`,
        ),
        businessData: strings(test.businessData, `${name}.businessData`),
        modelRefs: {
          entities: strings(modelRefs.entities, `${name}.modelRefs.entities`),
          associations: strings(
            modelRefs.associations,
            `${name}.modelRefs.associations`,
          ),
        },
      };
    }),
    tasks: array(body.tasks, 'tasks').map((entry, index) => {
      const name = `tasks[${String(index)}]`;
      const task = record(entry, name);
      return {
        id: text(task.id, `${name}.id`),
        description: text(task.description, `${name}.description`),
        testIds: strings(task.testIds, `${name}.testIds`),
        dependsOn: strings(task.dependsOn, `${name}.dependsOn`),
      };
    }),
  };
}

function record(value: unknown, name = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an array`);
  }
  return value;
}

function strings(value: unknown, name: string): string[] {
  return array(value, name).map((entry, index) =>
    text(entry, `${name}[${String(index)}]`),
  );
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw DomainError.validation(`${name} is required`);
  }
  return value;
}

function optionalText(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return text(value, name);
}

function positive(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}

function typescript(value: unknown, name: string): 'typescript' {
  if (value !== 'typescript') {
    throw DomainError.validation(`${name} must be typescript`);
  }
  return value;
}

function quadrant(value: unknown, name: string): 'Q1' | 'Q2' {
  if (value !== 'Q1' && value !== 'Q2') {
    throw DomainError.validation(`${name} must be Q1 or Q2`);
  }
  return value;
}

function deskCheckAction(value: unknown): DeskCheckAction {
  if (
    value !== 'approve' &&
    value !== 'revise' &&
    value !== 'architecture_gap' &&
    value !== 'process_gap' &&
    value !== 'scenario_gap'
  ) {
    throw DomainError.validation(
      `unsupported Desk Check action: ${String(value)}`,
    );
  }
  return value;
}
