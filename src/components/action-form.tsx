"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: string; error?: string; at?: number } | null;
export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * サーバーアクションのフォーム。結果のメッセージを上部に表示し、送信中は入力を止める。
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnOk = false,
  id,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnOk?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      id={id}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="notice notice-ok" role="status">
          {state.ok}
        </p>
      )}
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "処理中…",
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}
