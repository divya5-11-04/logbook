import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function callGemini(system: string, userMsg: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_role")
    .eq("id", user.id)
    .single();

  const { data: entries } = await supabase.from("entries").select("skills").eq("user_id", user.id);
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No entries logged yet" }, { status: 400 });
  }

  const { data: categories } = await supabase.from("categories").select("slug, label");
  if (!categories || categories.length === 0) {
    return NextResponse.json({ error: "No categories in dataset" }, { status: 500 });
  }

  // Classify the target role into the closest tracked category.
  let categorySlug = categories[0].slug;
  try {
    const classifyText = await callGemini(
      `Return ONLY a JSON object: {"slug":"the-best-matching-slug"}. Pick the single closest match from this list of category slugs: ${categories
        .map((c) => c.slug)
        .join(", ")}. No explanation.`,
      `Target role: ${profile?.target_role}`
    );
    const parsed = JSON.parse(classifyText);
    if (categories.some((c) => c.slug === parsed.slug)) categorySlug = parsed.slug;
  } catch {
    // fall back to first category if classification fails
  }

  const categoryLabel = categories.find((c) => c.slug === categorySlug)?.label ?? categorySlug;

  const { data: skillCounts, error: viewErr } = await supabase
    .from("category_skill_counts")
    .select("skill, skill_count, category_job_count")
    .eq("category_slug", categorySlug)
    .order("skill_count", { ascending: false });

  if (viewErr) return NextResponse.json({ error: viewErr.message }, { status: 500 });

  const mySkills = new Set(
    entries.flatMap((e) => e.skills || []).map((s: string) => s.trim().toLowerCase())
  );

  const jobCount = skillCounts?.[0]?.category_job_count ?? 0;
  const ranked = (skillCounts || [])
    .filter((s) => !mySkills.has(s.skill.trim().toLowerCase()))
    .slice(0, 8)
    .map((s) => ({ skill: s.skill, count: s.skill_count }));

  if (ranked.length === 0) {
    return NextResponse.json({
      ranked: [],
      jobCount,
      categoryLabel,
      reasoning: "Your logged skills already cover the top tracked skills for this category.",
      next_step: "Consider logging more advanced or specialized work to surface deeper gaps.",
    });
  }

  const gapList = ranked.map((r) => `${r.skill} (appears in ${r.count} of ${jobCount} postings)`).join("; ");
  const mySkillsList = [...mySkills].join(", ");

  let reasoning = "";
  let next_step = "";
  try {
    const resultText = await callGemini(
      `You are a career advisor. You are given a ranked list of real skill gaps computed from actual job posting frequency data, most in-demand first. Do not invent new skills or reorder the list — just explain it and give one concrete next action.
Return ONLY valid JSON, no markdown fences:
{"reasoning":"2-3 sentences on the pattern in these gaps, tied to the target role and what they already have","next_step":"one concrete, specific next action targeting the single highest-ranked gap"}`,
      `Target role: ${profile?.target_role}. Category matched: ${categoryLabel}. Already have: ${mySkillsList}. Ranked gaps (highest demand first): ${gapList}.`
    );
    const parsed = JSON.parse(resultText);
    reasoning = parsed.reasoning;
    next_step = parsed.next_step;
  } catch {
    reasoning = "Ranking above is from the dataset directly; the written explanation failed to generate.";
    next_step = `Focus on ${ranked[0].skill}, the highest-frequency gap.`;
  }

  return NextResponse.json({ ranked, jobCount, categoryLabel, reasoning, next_step });
}
