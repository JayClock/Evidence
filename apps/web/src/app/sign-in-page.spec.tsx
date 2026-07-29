import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignInPage } from './sign-in-page';

describe('SignInPage', () => {
  it('starts the configured organization sign-in', async () => {
    const onSignIn = vi.fn(async () => undefined);
    render(<SignInPage onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole('button', { name: '使用组织账号登录' }));

    await waitFor(() => expect(onSignIn).toHaveBeenCalledOnce());
  });

  it('renders an authentication configuration failure accessibly', () => {
    render(<SignInPage configurationError="OIDC issuer is missing" />);

    expect(screen.getByText('OIDC issuer is missing')).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
