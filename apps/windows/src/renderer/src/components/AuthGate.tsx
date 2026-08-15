import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Input, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowSync20Regular,
  Mail20Regular,
  SignOut20Regular,
} from "@fluentui/react-icons";
import type { SyncState } from "../../../preload/api-types";

type AuthMode = "sign-in" | "sign-up" | "forgot";

function messageForError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function AuthGate(props: {
  state: SyncState;
  onRefresh(): void;
}): React.JSX.Element {
  const { state } = props;
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(
    state.status === "verification_required",
  );

  useEffect(() => {
    setEmail(state.email ?? state.boundEmail ?? "");
    if (state.status === "verification_required") setShowVerification(true);
  }, [state.boundEmail, state.email, state.status]);

  const clearFormState = (): void => {
    setPassword("");
    setConfirmation("");
    setError(null);
    setNotice(null);
  };
  const switchMode = (next: AuthMode): void => {
    clearFormState();
    setMode(next);
    if (next === "sign-in") setShowVerification(false);
  };
  const auth = useMutation({
    mutationFn: async () => {
      if (mode === "forgot")
        return window.zhixu.account.requestPasswordReset(email);
      if (mode === "sign-up") {
        if (password !== confirmation) throw new Error("两次输入的密码不一致");
        return window.zhixu.account.signUp({ email, password });
      }
      return window.zhixu.account.signIn({ email, password });
    },
    onSuccess: () => {
      if (mode === "forgot") {
        setNotice("重置邮件已发送，请在当前设备打开邮件链接。");
        setMode("sign-in");
      }
      props.onRefresh();
    },
    onError: (value) => setError(messageForError(value)),
  });
  const completeReset = useMutation({
    mutationFn: async () => {
      if (password !== confirmation) throw new Error("两次输入的密码不一致");
      return window.zhixu.account.completePasswordReset(password);
    },
    onSuccess: props.onRefresh,
    onError: (value) => setError(messageForError(value)),
  });
  const resend = useMutation({
    mutationFn: () =>
      window.zhixu.account.resendVerification(state.email ?? email),
    onSuccess: () => {
      setNotice("验证邮件已重新发送。");
      props.onRefresh();
    },
    onError: (value) => setError(messageForError(value)),
  });
  const retry = useMutation({
    mutationFn: window.zhixu.sync.run,
    onSuccess: props.onRefresh,
    onError: (value) => setError(messageForError(value)),
  });
  const signOut = useMutation({
    mutationFn: window.zhixu.account.signOut,
    onSuccess: () => {
      switchMode("sign-in");
      props.onRefresh();
    },
    onError: (value) => setError(messageForError(value)),
  });

  if (state.status === "unconfigured")
    return (
      <AuthFrame
        title="账号服务未配置"
        description="当前版本缺少账号服务配置，暂时无法进入知序。"
      >
        <div className="auth-gate-status" role="alert">
          {state.message ?? "请安装已配置账号服务的知序版本。"}
        </div>
      </AuthFrame>
    );

  if (state.status === "verification_required" && showVerification)
    return (
      <AuthFrame
        title="验证邮箱"
        description={`验证邮件已发送至 ${state.email ?? email}。完成验证后将在当前设备继续首次同步。`}
      >
        <AuthFeedback error={error} notice={notice} />
        <div className="auth-gate-actions stacked">
          <Button
            appearance="primary"
            icon={<ArrowClockwise20Regular />}
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {resend.isPending ? "正在发送" : "重新发送验证邮件"}
          </Button>
          <Button appearance="subtle" onClick={() => switchMode("sign-in")}>
            返回登录
          </Button>
        </div>
      </AuthFrame>
    );

  if (state.status === "password_recovery") {
    const valid =
      password.length >= 8 &&
      password.length <= 72 &&
      password === confirmation;
    return (
      <AuthFrame
        title="设置新密码"
        description="新密码设置完成后将继续登录和同步。"
      >
        <div className="auth-gate-form">
          <PasswordFields
            password={password}
            confirmation={confirmation}
            onPasswordChange={setPassword}
            onConfirmationChange={setConfirmation}
          />
          <AuthFeedback error={error} notice={notice} />
          <Button
            appearance="primary"
            disabled={!valid || completeReset.isPending}
            onClick={() => completeReset.mutate()}
          >
            {completeReset.isPending ? "正在更新" : "更新密码"}
          </Button>
        </div>
      </AuthFrame>
    );
  }

  if (
    state.status === "binding" ||
    (state.status === "syncing" && !state.canUseApp)
  )
    return (
      <AuthFrame
        title="正在合并数据"
        description="本地数据与云端数据正在安全合并，完成后进入知序。"
      >
        <div className="auth-gate-progress" role="status">
          <Spinner size="medium" />
          <span>{state.message ?? "正在准备首次同步。"}</span>
        </div>
      </AuthFrame>
    );

  if (
    !state.canUseApp &&
    Boolean(state.email) &&
    (state.status === "error" || state.status === "offline")
  )
    return (
      <AuthFrame
        title="首次同步未完成"
        description="首次合并完成前无法进入工作区，本地数据不会被删除。"
      >
        <AuthFeedback error={error ?? state.message} notice={notice} />
        <div className="auth-gate-actions">
          <Button
            appearance="primary"
            icon={<ArrowSync20Regular />}
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? "正在重试" : "重试"}
          </Button>
          <Button
            icon={<SignOut20Regular />}
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            退出登录
          </Button>
        </div>
      </AuthFrame>
    );

  const isSignUp = mode === "sign-up";
  const isForgot = mode === "forgot";
  const validEmail = /.+@.+\..+/.test(email);
  const valid =
    validEmail &&
    (isForgot || (password.length >= 8 && password.length <= 72)) &&
    (!isSignUp || password === confirmation);
  return (
    <AuthFrame
      title={isSignUp ? "注册知序账号" : isForgot ? "找回密码" : "登录知序"}
      description={
        isSignUp
          ? "注册并验证邮箱后，知序会安全合并本地与云端数据。"
          : isForgot
            ? "重置链接只在发起操作的当前设备完成。"
            : "登录后进入本地工作区，离线时仍可继续使用。"
      }
    >
      <div className="auth-gate-form">
        <Field label="邮箱" required>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            contentBefore={<Mail20Regular />}
            onChange={(_, data) => setEmail(data.value)}
          />
        </Field>
        {!isForgot ? (
          <Field label="密码" required hint="密码长度为 8–72 位">
            <Input
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(_, data) => setPassword(data.value)}
            />
          </Field>
        ) : null}
        {isSignUp ? (
          <Field label="确认密码" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(_, data) => setConfirmation(data.value)}
            />
          </Field>
        ) : null}
        <AuthFeedback
          error={error ?? (state.status === "error" ? state.message : null)}
          notice={notice}
        />
        <Button
          appearance="primary"
          disabled={!valid || auth.isPending}
          onClick={() => auth.mutate()}
        >
          {auth.isPending
            ? "正在处理"
            : isSignUp
              ? "注册"
              : isForgot
                ? "发送重置邮件"
                : "登录"}
        </Button>
        <div className="auth-gate-links">
          {mode !== "sign-in" ? (
            <button type="button" onClick={() => switchMode("sign-in")}>
              返回登录
            </button>
          ) : (
            <button type="button" onClick={() => switchMode("forgot")}>
              忘记密码
            </button>
          )}
          {!state.boundEmail && mode !== "sign-up" ? (
            <button type="button" onClick={() => switchMode("sign-up")}>
              注册账号
            </button>
          ) : null}
        </div>
      </div>
    </AuthFrame>
  );
}

function AuthFrame(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="auth-gate">
      <section className="auth-gate-panel" aria-labelledby="auth-gate-title">
        <header className="auth-gate-header">
          <div className="auth-gate-brand" aria-label="知序">
            <span className="auth-gate-brand-mark" aria-hidden="true">
              <img src="./zhixu-mark-1024.png" alt="" />
            </span>
            <strong>知序</strong>
          </div>
          <h1 id="auth-gate-title">{props.title}</h1>
          <p>{props.description}</p>
        </header>
        {props.children}
      </section>
    </main>
  );
}

function PasswordFields(props: {
  password: string;
  confirmation: string;
  onPasswordChange(value: string): void;
  onConfirmationChange(value: string): void;
}): React.JSX.Element {
  return (
    <>
      <Field label="新密码" required hint="密码长度为 8–72 位">
        <Input
          type="password"
          autoComplete="new-password"
          value={props.password}
          onChange={(_, data) => props.onPasswordChange(data.value)}
        />
      </Field>
      <Field label="确认密码" required>
        <Input
          type="password"
          autoComplete="new-password"
          value={props.confirmation}
          onChange={(_, data) => props.onConfirmationChange(data.value)}
        />
      </Field>
    </>
  );
}

function AuthFeedback(props: {
  error: string | null;
  notice: string | null;
}): React.JSX.Element | null {
  if (props.error)
    return (
      <p className="error-message auth-gate-feedback" role="alert">
        {props.error}
      </p>
    );
  if (props.notice)
    return (
      <p className="success-message auth-gate-feedback" role="status">
        {props.notice}
      </p>
    );
  return null;
}
