"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-9" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      <div>
        <label htmlFor="email" className="label">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "login-error" : undefined}
          className="input mt-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "login-error" : undefined}
          className="input mt-2"
        />
      </div>

      {state.error ? (
        <p id="login-error" role="alert" className="font-sans text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <SubmitButton variant="primary" pendingLabel="Entrando…" className="w-full">
        Entrar
      </SubmitButton>
    </form>
  );
}
