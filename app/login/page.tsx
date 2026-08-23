"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "github") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    });
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Welcome back</h1>
      <p style={{ color: "var(--brass-dark)", fontStyle: "italic", marginBottom: 28 }}>
        Sign in to your logbook.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => handleOAuth("google")}>
          Continue with Google
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => handleOAuth("github")}>
          Continue with GitHub
        </button>
      </div>

      <div style={{ textAlign: "center", color: "var(--brass-dark)", fontSize: 12, margin: "18px 0" }}>
        or with email
      </div>

      <form onSubmit={handleLogin}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 12 }} disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 13.5, textAlign: "center" }}>
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </div>
  );
}
