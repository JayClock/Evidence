import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Spinner,
} from '@evidence/ui';

export function SignInPage({
  onSignIn,
  configurationError,
}: {
  onSignIn?: () => Promise<void>;
  configurationError?: string;
}) {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const error = configurationError ?? actionError;

  const signIn = async () => {
    if (!onSignIn) return;
    setPending(true);
    setActionError(undefined);
    try {
      await onSignIn();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : '无法启动身份认证。',
      );
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 Evidence</CardTitle>
          <CardDescription>
            使用组织身份继续访问你的 Workspace 与交付记录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>身份认证不可用</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              登录将在身份提供商的安全页面中完成。
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            disabled={pending || !onSignIn}
            onClick={() => void signIn()}
            type="button"
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? '正在跳转…' : '使用组织账号登录'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
