import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

const VENDOR_PREFIX = 'application/vnd.evidence';

@Injectable()
export class VendorMediaTypeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; path?: string; url?: string }>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    const contentType = vendorMediaType(
      request.method ?? 'GET',
      request.path ?? request.url ?? '',
    );
    if (contentType) {
      response.setHeader('Content-Type', contentType);
    }
    return next.handle();
  }
}

export function vendorMediaType(
  method: string,
  requestPath: string,
): string | null {
  const path = requestPath.split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0 || segments.join('/') === 'api') {
    return mediaType('root');
  }
  if (segments.join('/') === 'health') {
    return mediaType('health');
  }
  if (segments[0] !== 'api') {
    return null;
  }

  const apiSegments = segments.slice(1);
  if (matches(apiSegments, ['users', '*'])) return mediaType('user');
  if (matches(apiSegments, ['users', '*', 'sidebar'])) {
    return mediaType('sidebar');
  }
  if (matches(apiSegments, ['users', '*', 'memberships'])) {
    return mediaType('memberships');
  }
  if (matches(apiSegments, ['workspaces'])) {
    return method.toUpperCase() === 'POST' ? mediaType('workspace') : null;
  }
  if (matches(apiSegments, ['workspaces', '*'])) {
    return mediaType('workspace');
  }
  if (matches(apiSegments, ['workspaces', '*', 'members'])) {
    return mediaType('members');
  }
  if (matches(apiSegments, ['workspaces', '*', 'members', '*'])) {
    return mediaType('member');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram'])) {
    return mediaType('diagram');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'nodes'])) {
    return mediaType('nodes');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'nodes', '*'])) {
    return mediaType('node');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'edges'])) {
    return mediaType('edges');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'edges', '*'])) {
    return mediaType('edge');
  }
  if (matches(apiSegments, ['workspaces', '*', 'inbox-items'])) {
    return method.toUpperCase() === 'POST'
      ? mediaType('inbox-item')
      : mediaType('inbox-items');
  }
  if (matches(apiSegments, ['workspaces', '*', 'inbox-items', '*'])) {
    return mediaType('inbox-item');
  }
  if (
    matches(apiSegments, ['workspaces', '*', 'inbox-items', '*', 'revisions'])
  ) {
    return method.toUpperCase() === 'POST'
      ? mediaType('inbox-revision')
      : mediaType('inbox-revisions');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'inbox-items',
      '*',
      'revisions',
      '*',
    ])
  ) {
    return mediaType('inbox-revision');
  }
  if (matches(apiSegments, ['workspaces', '*', 'inbox-extractions'])) {
    return method.toUpperCase() === 'POST'
      ? mediaType('inbox-extraction')
      : null;
  }
  if (matches(apiSegments, ['workspaces', '*', 'inbox-extractions', '*'])) {
    return mediaType('inbox-extraction');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'inbox-extractions',
      '*',
      'candidates',
    ])
  ) {
    return method.toUpperCase() === 'POST'
      ? mediaType('inbox-candidate-set')
      : null;
  }
  if (matches(apiSegments, ['workspaces', '*', 'story-candidates'])) {
    return mediaType('story-candidates');
  }
  if (matches(apiSegments, ['workspaces', '*', 'story-candidates', '*'])) {
    return mediaType('story-candidate');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'story-candidates',
      '*',
      'defer',
    ]) ||
    matches(apiSegments, ['workspaces', '*', 'story-candidates', '*', 'reject'])
  ) {
    return method.toUpperCase() === 'POST'
      ? mediaType('story-candidate')
      : null;
  }
  if (
    matches(apiSegments, ['workspaces', '*', 'story-candidates', '*', 'select'])
  ) {
    return method.toUpperCase() === 'POST' ? mediaType('iteration') : null;
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*'])) {
    return mediaType('iteration');
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'intake'])) {
    return mediaType('iteration-intake');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'provisioning',
      '*',
    ])
  ) {
    return method.toUpperCase() === 'POST' ? mediaType('iteration') : null;
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'kickoff'])) {
    return mediaType('kickoff');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'kickoff',
      'proposals',
    ])
  ) {
    return method.toUpperCase() === 'POST'
      ? mediaType('kickoff-proposal')
      : null;
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'kickoff',
      'decisions',
    ])
  ) {
    return method.toUpperCase() === 'POST'
      ? mediaType('kickoff-decision-result')
      : null;
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'understanding',
    ])
  ) {
    return mediaType('understanding');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'understanding',
      'clarifications',
    ])
  ) {
    return mediaType('clarification');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'understanding',
      'clarifications',
      '*',
      'answer',
    ])
  ) {
    return mediaType('clarification-answer-result');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'understanding',
      'scenario-proposals',
    ])
  ) {
    return mediaType('scenario-proposal');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'understanding',
      'decisions',
    ])
  ) {
    return mediaType('understanding-decision-result');
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'tasking'])) {
    return mediaType('tasking');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'tasking',
      'no-model-impact',
    ])
  ) {
    return mediaType('no-model-impact-decision');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'tasking',
      'candidates',
    ])
  ) {
    return mediaType('tasking-candidate');
  }
  if (
    matches(apiSegments, [
      'workspaces',
      '*',
      'iterations',
      '*',
      'tasking',
      'decisions',
    ])
  ) {
    return mediaType('desk-check-decision-result');
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'pair'])) {
    return mediaType('pair');
  }
  if (
    apiSegments.length >= 6 &&
    matches(apiSegments.slice(0, 5), [
      'workspaces',
      '*',
      'iterations',
      '*',
      'pair',
    ])
  ) {
    return apiSegments.at(-1) === 'runs'
      ? mediaType('pair-start-result')
      : mediaType('pair-action-result');
  }
  if (
    matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'showcase'])
  ) {
    return mediaType('showcase');
  }
  if (
    apiSegments.length === 6 &&
    matches(apiSegments.slice(0, 5), [
      'workspaces',
      '*',
      'iterations',
      '*',
      'showcase',
    ])
  ) {
    return mediaType('showcase-action-result');
  }
  if (matches(apiSegments, ['workspaces', '*', 'iterations', '*', 'respond'])) {
    return mediaType('respond');
  }
  if (
    apiSegments.length === 6 &&
    matches(apiSegments.slice(0, 5), [
      'workspaces',
      '*',
      'iterations',
      '*',
      'respond',
    ])
  ) {
    return mediaType('respond-action-result');
  }
  if (matches(apiSegments, ['workspaces', '*', 'stories'])) {
    return mediaType('stories');
  }
  if (matches(apiSegments, ['workspaces', '*', 'stories', '*'])) {
    return mediaType('story');
  }
  if (matches(apiSegments, ['workspaces', '*', 'stories', '*', 'revisions'])) {
    return method.toUpperCase() === 'POST'
      ? mediaType('story-revision')
      : mediaType('story-revisions');
  }
  if (
    matches(apiSegments, ['workspaces', '*', 'stories', '*', 'revisions', '*'])
  ) {
    return mediaType('story-revision');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-entities'])) {
    return mediaType('logical-entities');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-entities', '*'])) {
    return mediaType('logical-entity');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-relationships'])) {
    return mediaType('logical-relationships');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-relationships', '*'])) {
    return mediaType('logical-relationship');
  }
  return null;
}

function matches(actual: string[], pattern: string[]): boolean {
  return (
    actual.length === pattern.length &&
    pattern.every(
      (segment, index) => segment === '*' || segment === actual[index],
    )
  );
}

function mediaType(resource: string): string {
  return `${VENDOR_PREFIX}.${resource}+json`;
}
