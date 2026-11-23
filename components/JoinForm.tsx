"use client";

import { useState } from "react";

export default function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="join-form">
      <label htmlFor="code">Access code</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. 7K4M9QPX"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={12}
      />
      <button className="primary-btn" disabled={busy || code.trim().length < 6}>
        {busy ? "Linking…" : "Link this phone"}
      </button>
      {error && <p className="notice err">{error}</p>}
    </form>
  );
}
