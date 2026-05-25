import { StrictMode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import {
  apiClient,
  initializeApiClient,
  ResourceProvider,
} from '@evidence/api-client';
import { appRoutes } from './app/route';

async function bootstrap() {
  await initializeApiClient();

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  const router = createBrowserRouter(appRoutes);

  root.render(
    <StrictMode>
      <ResourceProvider client={apiClient}>
        <RouterProvider router={router} />
      </ResourceProvider>
    </StrictMode>,
  );
}

void bootstrap();
