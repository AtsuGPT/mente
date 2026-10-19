"use client";

import { useActionState } from "react";
import { accessLoginAction, guestAccessAction, type AccessLoginState } from "@/lib/auth/login";

export function AccessForm() {
  const [state, action, pending] = useActionState<AccessLoginState, FormData>(accessLoginAction, {});

  return (
    <div className="access-panel">
      <form action={action} className="access-credentials">
        <label className="access-field" htmlFor="access-username">
          <span>Usuário</span>
          <input id="access-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus maxLength={254} placeholder="Seu usuário" />
        </label>
        <label className="access-field" htmlFor="access-password">
          <span>Senha</span>
          <input id="access-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} placeholder="Sua senha" />
        </label>
        {state.error ? <p className="access-error" role="alert">{state.error}</p> : null}
        <button className="access-submit" type="submit" disabled={pending}>
          {pending ? "Verificando…" : "Entrar"}
          <span aria-hidden="true">↗</span>
        </button>
      </form>

      <div className="access-divider"><span>ou</span></div>

      <form action={guestAccessAction}>
        <button className="access-guest" type="submit">Entrar como convidado</button>
      </form>
    </div>
  );
}