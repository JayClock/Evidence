import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import {
  apiClient,
  initializeApiClient,
  ResourceProvider,
} from '@evidence/api-client';
import App from './app/app';

async function bootstrap() {
  await initializeApiClient();

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  root.render(
    <StrictMode>
      <ResourceProvider client={apiClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ResourceProvider>
    </StrictMode>,
  );
}

void bootstrap();
