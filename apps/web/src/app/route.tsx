import {
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
} from 'react-router-dom';

import App from './app';

export function appRouteLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appPathname = canonicalAppPathname(url.pathname);

  if (appPathname !== url.pathname) {
    return redirect(`${appPathname}${url.search}${url.hash}`);
  }

  return null;
}

function canonicalAppPathname(pathname: string) {
  if (pathname === '/api') {
    return '/';
  }

  if (pathname.startsWith('/api/')) {
    return pathname.slice('/api'.length);
  }

  return pathname;
}

export const appRoutes = [
  {
    path: '*',
    loader: appRouteLoader,
    element: <App />,
  },
] satisfies RouteObject[];
