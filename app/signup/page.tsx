"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [voice, setVoice] = useState("direct and understated");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, target_role: role, voice },
        emailRedirectTo: `${location.origin}/api/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // If email confirmation is on, there's no session yet.
    if (!data.session) {
      setCheckEmail(true);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "github") {
    // OAuth signups skip this form's onboarding fields — profile gets sensible
    // defaults via the handle_new_user trigger, editable from Settings after.
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    });
  }

  if (checkEmail) {
    return (
      <div style={{ maxWidth: 420, margin: "100px auto", padding: "0 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Check your email</h1>
        <p style={{ color: "var(--brass-dark)" }}>
          We sent a confirmation link to {email}. Click it to activate your logbook.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: "60px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Start your logbook</h1>
      <p style={{ color: "var(--brass-dark)", fontStyle: "italic", marginBottom: 28 }}>
        A running record of what you build — turned into posts, a resume, and a plan.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => handleOAuth("google")}>
          Sign up with Google
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => handleOAuth("github")}>
          Sign up with GitHub
        </button>
      </div>

      <div style={{ textAlign: "center", color: "var(--brass-dark)", fontSize: 12, margin: "18px 0" }}>
        or with email
      </div>

      <form onSubmit={handleSignup}>
        <div className="field">
          <label>Your name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Target role or field</label>
          <input type="text" value={role} onChange={(e) => setRole(e.target.value)} required />
        </div>
        <div className="field">
          <label>Voice for your posts</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="direct and understated">Direct and understated</option>
            <option value="warm and enthusiastic">Warm and enthusiastic</option>
            <option value="technical and precise">Technical and precise</option>
            <option value="confident and punchy">Confident and punchy</option>
          </select>
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 12 }} disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 13.5, textAlign: "center" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
