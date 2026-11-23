"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function AdminLogin() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="staff">
      <header className="staff-head">
        <div className="brand-mark">V</div>
        <div>
          <div className="muted small">Verank Farms</div>
          <div className="staff-name">Admin</div>
        </div>
      </header>
      <form action={action} className="card join-form">
        <label htmlFor="pw">Admin password</label>
        <input id="pw" name="password" type="password" autoComplete="current-password" />
        <button className="primary-btn" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {state?.error && <p className="notice err">{state.error}</p>}
      </form>
    </main>
  );
}
