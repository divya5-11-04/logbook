import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

async function callGemini(system: string, userMsg: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMsg }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    console.error("Gemini API error:", data);

    throw new Error(
      data?.error?.message ||
        `Gemini request failed with status ${res.status}`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("Unexpected Gemini response:", data);
    throw new Error("Empty Gemini response");
  }

  return text;
}

function classifyRole(
  targetRole: string,
  categories: { slug: string; label: string }[]
) {
  const role = targetRole.toLowerCase();

  const rules: Record<string, string[]> = {
    "information-technology": [
      "ai",
      "artificial intelligence",
      "machine learning",
      "ml engineer",
      "ai engineer",
      "data engineer",
      "data scientist",
      "software engineer",
      "software developer",
      "backend",
      "frontend",
      "full stack",
      "full-stack",
      "devops",
      "cloud",
      "cybersecurity",
      "cyber security",
      "developer",
      "programmer",
      "robotics",
    ],

    "business-development": [
      "business development",
      "partnership",
      "partnerships",
      "growth manager",
      "growth",
    ],

    finance: [
      "finance",
      "financial analyst",
      "investment",
      "banking",
      "accounting",
      "accountant",
      "financial",
    ],

    hr: [
      "human resources",
      "hr",
      "recruiter",
      "recruitment",
      "talent acquisition",
      "people operations",
    ],

    sales: [
      "sales",
      "account executive",
      "sales executive",
      "sales manager",
      "business sales",
    ],

    marketing: [
      "marketing",
      "digital marketing",
      "seo",
      "content marketing",
      "brand manager",
      "social media",
    ],

    design: [
      "designer",
      "ui designer",
      "ux designer",
      "product designer",
      "graphic designer",
    ],

    operations: [
      "operations",
      "supply chain",
      "procurement",
      "logistics",
      "operations manager",
    ],

    legal: [
      "legal",
      "lawyer",
      "attorney",
      "compliance",
      "paralegal",
    ],

    healthcare: [
      "healthcare",
      "health care",
      "clinical",
      "medical",
      "pharma",
      "pharmaceutical",
    ],

    education: [
      "teacher",
      "teaching",
      "education",
      "professor",
      "lecturer",
      "academic",
    ],

    "customer-success": [
      "customer success",
      "customer support",
      "customer experience",
      "client success",
    ],
  };

  // Prefer longer/more specific matches first.
  const matches: { slug: string; length: number }[] = [];

  for (const category of categories) {
    const keywords = rules[category.slug] || [];

    for (const keyword of keywords) {
      if (role.includes(keyword)) {
        matches.push({
          slug: category.slug,
          length: keyword.length,
        });
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.length - a.length);
    return matches[0].slug;
  }

  const it = categories.find(
    (category) => category.slug === "information-technology"
  );

  return it?.slug || categories[0]?.slug;
}

export async function POST() {
  try {
    // ------------------------------------------------------------
    // Create clients at request time, NOT at module/build time.
    // ------------------------------------------------------------
    const supabase = createServerClient();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
    }

    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ------------------------------------------------------------
    // 1. Authentication
    // ------------------------------------------------------------
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Auth error:", authError);

      return NextResponse.json(
        {
          error: "Authentication failed",
          details: authError.message,
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ------------------------------------------------------------
    // 2. Profile
    // ------------------------------------------------------------
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("target_role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);

      return NextResponse.json(
        {
          error: "Could not load profile",
          details: profileError.message,
        },
        { status: 500 }
      );
    }

    if (!profile?.target_role) {
      return NextResponse.json(
        {
          error: "Your target role is not set.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 3. User entries / existing skills
    // ------------------------------------------------------------
    const { data: entries, error: entriesError } = await supabase
      .from("entries")
      .select("skills")
      .eq("user_id", user.id);

    if (entriesError) {
      console.error("Entries error:", entriesError);

      return NextResponse.json(
        {
          error: "Could not load your entries",
          details: entriesError.message,
        },
        { status: 500 }
      );
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        {
          error:
            "No entries logged yet. Log at least one project first.",
        },
        { status: 400 }
      );
    }

    const mySkills = new Set(
      entries
        .flatMap((entry) => entry.skills || [])
        .filter(
          (skill): skill is string => typeof skill === "string"
        )
        .map((skill) => skill.trim().toLowerCase())
        .filter(Boolean)
    );

    // ------------------------------------------------------------
    // 4. Categories
    // ------------------------------------------------------------
    const { data: categories, error: categoriesError } =
      await supabaseAdmin
        .from("categories")
        .select("slug, label");

    if (categoriesError) {
      console.error("Categories error:", categoriesError);

      return NextResponse.json(
        {
          error: "Could not load categories",
          details: categoriesError.message,
        },
        { status: 500 }
      );
    }

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        {
          error: "No categories found in database",
        },
        { status: 500 }
      );
    }

    // ------------------------------------------------------------
    // 5. Determine category
    // ------------------------------------------------------------
    const categorySlug = classifyRole(
      profile.target_role,
      categories
    );

    const category =
      categories.find(
        (item) => item.slug === categorySlug
      ) || null;

    const categoryLabel =
      category?.label || categorySlug;

    console.log("Growth category:", {
      targetRole: profile.target_role,
      categorySlug,
      categoryLabel,
    });

    // ------------------------------------------------------------
    // 6. Read actual skill-frequency data
    // ------------------------------------------------------------
    const { data: skillCounts, error: skillError } =
      await supabaseAdmin
        .from("category_skill_counts")
        .select(
          "category_slug, skill, skill_count, category_job_count"
        )
        .eq("category_slug", categorySlug)
        .order("skill_count", { ascending: false });

    if (skillError) {
      console.error("Skill view error:", skillError);

      return NextResponse.json(
        {
          error: "Could not load skill-frequency data",
          details: skillError.message,
        },
        { status: 500 }
      );
    }

    if (!skillCounts || skillCounts.length === 0) {
      return NextResponse.json(
        {
          error: `No job-skill data available for ${categoryLabel}.`,
          categorySlug,
          categoryLabel,
        },
        { status: 404 }
      );
    }

    // ------------------------------------------------------------
    // 7. Deterministic ranking
    // ------------------------------------------------------------
    const jobCount =
      skillCounts[0]?.category_job_count || 0;

    const ranked = skillCounts
      .filter((row) => {
        if (
          !row.skill ||
          typeof row.skill !== "string"
        ) {
          return false;
        }

        return !mySkills.has(
          row.skill.trim().toLowerCase()
        );
      })
      .slice(0, 8)
      .map((row) => ({
        skill: row.skill,
        count: row.skill_count,
      }));

    console.log("Growth result:", {
      categorySlug,
      jobCount,
      existingSkills: [...mySkills],
      ranked,
    });

    if (ranked.length === 0) {
      return NextResponse.json({
        ranked: [],
        jobCount,
        categoryLabel,
        reasoning:
          "Your logged skills already cover the top tracked skills for this category.",
        next_step:
          "Log more advanced or specialized work to surface deeper gaps.",
      });
    }

    // ------------------------------------------------------------
    // 8. Gemini explanation
    // ------------------------------------------------------------
    let reasoning =
      "These are the most frequently occurring skills in the tracked job postings that are not yet present in your logged work.";

    let next_step =
      `Focus next on ${ranked[0].skill}, which is the highest-frequency missing skill.`;

    try {
      const gapList = ranked
        .map(
          (item) =>
            `${item.skill} (${item.count} of ${jobCount} postings)`
        )
        .join("; ");

      const existingSkills =
        [...mySkills].sort().join(", ") || "None";

      const explanation = await callGemini(
        `
You are a concise career advisor.

The skill ranking has already been calculated from real job-posting data.

Do not invent skills.
Do not add skills.
Do not reorder the ranking.
Do not change the counts.

Return ONLY valid JSON:
{
  "reasoning": "2-3 concise sentences",
  "next_step": "one concrete action targeting the highest-ranked skill"
}
        `,
        `
Target role: ${profile.target_role}
Category: ${categoryLabel}

Existing skills:
${existingSkills}

Missing skills ranked by frequency:
${gapList}
        `
      );

      const parsed = JSON.parse(explanation);

      if (typeof parsed.reasoning === "string") {
        reasoning = parsed.reasoning;
      }

      if (typeof parsed.next_step === "string") {
        next_step = parsed.next_step;
      }
    } catch (error) {
      console.error(
        "Gemini explanation failed. Keeping database ranking:",
        error
      );
    }

    // ------------------------------------------------------------
    // 9. Response
    // ------------------------------------------------------------
    return NextResponse.json({
      ranked,
      jobCount,
      categoryLabel,
      reasoning,
      next_step,
    });
  } catch (error) {
    console.error("Growth route failed:", error);

    return NextResponse.json(
      {
        error: "Growth analysis failed.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}