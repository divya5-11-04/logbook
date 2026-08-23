"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category = { id: number; slug: string; label: string };
type Entry = {
  id: string;
  title: string;
  type: string;
  domain: string;
  skills: string[];
  impact_metric: string;
  post: string;
  resume_bullet: string;
  created_at: string;
};
type Profile = { name: string; target_role: string; voice: string };

export default function DashboardClient({
  profile,
  categories,
  initialEntries,
  userEmail,
}: {
  profile: Profile;
  categories: Category[];
  initialEntries: Entry[];
  userEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"log" | "resume" | "grow" | "data">("log");
  const [entries, setEntries] = useState<Entry[]>(initialEntries);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 80px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 0",
          borderBottom: "1px solid var(--line)",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 19 }}>Logbook</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
          <span className="tag">
            {profile.name} · {profile.target_role}
          </span>
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav style={{ display: "flex", gap: 26, borderBottom: "1px solid var(--line)", margin: "20px 0" }}>
        {(["log", "resume", "grow", "data"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 0",
              fontWeight: 500,
              fontSize: 13.5,
              color: tab === t ? "var(--ink)" : "var(--brass-dark)",
              borderBottom: tab === t ? "2px solid var(--rust)" : "2px solid transparent",
            }}
          >
            {{ log: "Log", resume: "Resume", grow: "Learn next", data: "Dataset" }[t]}
          </button>
        ))}
      </nav>

      {tab === "log" && <LogTab profile={profile} entries={entries} setEntries={setEntries} />}
      {tab === "resume" && <ResumeTab entries={entries} profile={profile} />}
      {tab === "grow" && <GrowTab entries={entries} profile={profile} categories={categories} />}
      {tab === "data" && <DataTab categories={categories} />}
    </div>
  );
}

function LogTab({
  profile,
  entries,
  setEntries,
}: {
  profile: Profile;
  entries: Entry[];
  setEntries: (e: Entry[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function generate() {
    if (!raw.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      alert("Generation failed — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      setEntries([saved, ...entries]);
      setResult(null);
      setRaw("");
    } catch {
      alert("Could not save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)", marginBottom: 4 }}>
          New entry
        </div>
        <h3 style={{ marginTop: 2 }}>What did you just do?</h3>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="e.g. Finished the AWS Solutions Architect Associate cert after 6 weeks of studying nights"
        />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? "Thinking..." : "Generate post & resume bullet"}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span className="tag">{result.type}</span>
            <span className="tag brass">{result.domain}</span>
            {result.skills.map((s: string) => (
              <span className="tag" key={s}>
                {s}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)" }}>LinkedIn post</div>
          <div
            contentEditable
            suppressContentEditableWarning
            style={{
              whiteSpace: "pre-wrap",
              background: "var(--paper-2)",
              borderRadius: 4,
              padding: "16px 18px",
              fontSize: 14.5,
              lineHeight: 1.65,
              marginTop: 6,
            }}
            onBlur={(e) => (result.post = e.currentTarget.textContent || "")}
          >
            {result.post}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)", marginTop: 18 }}>
            Resume bullet
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            style={{
              fontFamily: "serif",
              background: "var(--paper-2)",
              borderRadius: 4,
              padding: "14px 18px",
              fontSize: 15,
              marginTop: 6,
            }}
            onBlur={(e) => (result.resume_bullet = e.currentTarget.textContent || "")}
          >
            {result.resume_bullet}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save to logbook"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Past entries</h3>
        {entries.length === 0 && <p style={{ fontStyle: "italic", color: "var(--brass-dark)" }}>Nothing logged yet.</p>}
        {entries.map((e) => (
          <div key={e.id} style={{ borderBottom: "1px solid var(--line)", padding: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{e.title}</strong>
              <span style={{ fontSize: 11, color: "var(--brass-dark)" }}>
                {new Date(e.created_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ fontSize: 14, margin: "6px 0" }}>{e.resume_bullet}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {e.skills.map((s) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ResumeTab({ entries, profile }: { entries: Entry[]; profile: Profile }) {
  const byDomain: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    byDomain[e.domain] = byDomain[e.domain] || [];
    byDomain[e.domain].push(e);
  });
  return (
    <div className="card">
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)" }}>
        {profile.name} — targeting {profile.target_role}
      </div>
      <h3>Living resume</h3>
      {entries.length === 0 && <p style={{ fontStyle: "italic" }}>Log an accomplishment to build your resume.</p>}
      {Object.entries(byDomain).map(([domain, list]) => (
        <div key={domain} style={{ marginBottom: 22 }}>
          <h4
            style={{
              fontSize: 11.5,
              textTransform: "uppercase",
              color: "var(--brass-dark)",
              borderBottom: "1px solid var(--line)",
              paddingBottom: 6,
            }}
          >
            {domain}
          </h4>
          {list.map((e) => (
            <div key={e.id} style={{ fontSize: 14.5, margin: "9px 0", paddingLeft: 14, position: "relative" }}>
              <span style={{ position: "absolute", left: 0, color: "var(--rust)" }}>—</span>
              {e.resume_bullet}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GrowTab({
  entries,
  profile,
  categories,
}: {
  entries: Entry[];
  profile: Profile;
  categories: Category[];
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function getGrowth() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/growth", { method: "POST" });
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch {
      alert("Could not get suggestions — try again.");
    } finally {
      setLoading(false);
    }
  }

  const mySkills = [...new Set(entries.flatMap((e) => e.skills))];

  return (
    <>
      <div className="card">
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)" }}>
          Skills logged so far
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {mySkills.length === 0 && <span style={{ fontStyle: "italic" }}>None yet.</span>}
          {mySkills.map((s) => (
            <span className="tag" key={s}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>What should I learn next?</h3>
        <p style={{ fontSize: 13.5, color: "#4a4a44" }}>
          Ranked against real skill frequency from job postings in your matched category — not a guess.
        </p>
        <button className="btn btn-primary" onClick={getGrowth} disabled={loading}>
          {loading ? "Ranking gaps..." : "Get suggestions"}
        </button>
        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {result.ranked.map((r: any) => (
                <span className="tag brass" key={r.skill}>
                  {r.skill} · {r.count}/{result.jobCount}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--brass-dark)" }}>
              Matched category: {result.categoryLabel} · ranked across {result.jobCount} postings
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "14px 0" }}>{result.reasoning}</p>
            <div style={{ background: "var(--paper-2)", borderRadius: 4, padding: "14px 18px" }}>
              <strong>Next step:</strong> {result.next_step}
            </div>
          </div>
        )}
        <div
          style={{
            fontSize: 12.5,
            color: "var(--brass-dark)",
            background: "#F3E9D2",
            borderLeft: "2px solid var(--brass)",
            padding: "9px 13px",
            marginTop: 14,
          }}
        >
          Rankings come from a shared, growing dataset of real job postings — add more on the Dataset tab.
        </div>
      </div>
    </>
  );
}

function DataTab({ categories }: { categories: Category[] }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const [customCategory, setCustomCategory] = useState("");
  const [title, setTitle] = useState("");
  const [skills, setSkills] = useState("");
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<any[]>([]);

  async function addPosting() {
    if (!title.trim() || !skills.trim()) {
      alert("Add a title and at least one skill.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId || null,
          new_category_label: categoryId ? null : customCategory,
          title,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setAdded([saved, ...added]);
      setTitle("");
      setSkills("");
    } catch {
      alert("Could not save posting — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--brass-dark)" }}>Dataset</div>
        <h3>Categories tracked</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <span className="tag" key={c.id}>
              {c.label}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "#4a4a44", marginTop: 14 }}>
          Don't see your field? Add a posting below with a new category name and it's created automatically.
        </p>
      </div>
      <div className="card">
        <h3>Add a job posting</h3>
        <div className="field">
          <label>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value={0}>+ New category</option>
          </select>
        </div>
        {categoryId === 0 && (
          <div className="field">
            <label>New category name</label>
            <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Job title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Required skills, comma separated</label>
          <textarea value={skills} onChange={(e) => setSkills(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={addPosting} disabled={saving}>
          {saving ? "Adding..." : "Add to dataset"}
        </button>
      </div>
      <div className="card">
        <h3>Your added postings this session</h3>
        {added.length === 0 && <p style={{ fontStyle: "italic" }}>Nothing added yet.</p>}
        {added.map((p) => (
          <div key={p.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
            <strong>{p.title}</strong>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {p.skills.map((s: string) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
