import { StrictMode, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import {
  apiClient,
  browserAuthentication,
  initializeApiClient,
  ResourceProvider,
} from '@evidence/api-client';
import { appRoutes } from './app/route';
import { SignInPage } from './app/sign-in-page';

async function bootstrap() {
  let authentication;
  try {
    authentication = await browserAuthentication.initialize();
  } catch (error) {
    render(
      <SignInPage
        configurationError={
          error instanceof Error ? error.message : '无法初始化身份认证。'
        }
      />,
    );
    return;
  }

  if (authentication.status === 'sign-in-required') {
    render(<SignInPage onSignIn={() => browserAuthentication.signIn()} />);
    return;
  }

  await initializeApiClient(
    authentication.mode === 'oidc'
      ? () => browserAuthentication.authorization()
      : undefined,
  );
  const router = createBrowserRouter(appRoutes);
  render(
    <ResourceProvider client={apiClient}>
      <RouterProvider router={router} />
    </ResourceProvider>,
  );
}

function render(children: ReactNode): void {
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );
  root.render(<StrictMode>{children}</StrictMode>);
}

void bootstrap();
