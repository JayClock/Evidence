import { appRouteLoader } from './route';

function loaderRequest(path: string) {
  return {
    request: new Request(`http://localhost${path}`),
    params: {},
  } as Parameters<typeof appRouteLoader>[0];
}

describe('appRouteLoader', () => {
  it('redirects API resource URLs to canonical app routes', () => {
    const response = appRouteLoader(
      loaderRequest('/api/users/desktop-user?tab=links'),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe(
      '/users/desktop-user?tab=links',
    );
  });

  it('does not redirect canonical app routes', () => {
    expect(appRouteLoader(loaderRequest('/workspaces'))).toBeNull();
  });
});
