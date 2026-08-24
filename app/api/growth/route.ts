import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
        `Gemini API request failed with status ${res.status}`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("Unexpected Gemini response:", data);
    throw new Error("Empty response from Gemini");
  }

  return text;
}

export async function POST() {
  try {
    const supabase = createClient();

    // ------------------------------------------------------------
    // 1. Get authenticated user
    // ------------------------------------------------------------
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Auth error:", userError);
      return NextResponse.json(
        { error: "Authentication failed" },
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
    // 2. Get user's target role
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
          error: "Could not load your profile.",
          details: profileError.message,
        },
        { status: 500 }
      );
    }

    if (!profile?.target_role) {
      return NextResponse.json(
        { error: "Please set your target role first." },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 3. Get user's logged skills
    // ------------------------------------------------------------
    const { data: entries, error: entriesError } = await supabase
      .from("entries")
      .select("skills")
      .eq("user_id", user.id);

    if (entriesError) {
      console.error("Entries error:", entriesError);

      return NextResponse.json(
        {
          error: "Could not load your logged skills.",
          details: entriesError.message,
        },
        { status: 500 }
      );
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: "No entries logged yet" },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 4. Flatten and normalize user's skills
    // ------------------------------------------------------------
    const mySkills = new Set(
      entries
        .flatMap((entry) => entry.skills || [])
        .filter((skill): skill is string => typeof skill === "string")
        .map((skill) => skill.trim().toLowerCase())
        .filter(Boolean)
    );

    // ------------------------------------------------------------
    // 5. Get all available categories
    // ------------------------------------------------------------
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("slug, label");

    if (categoriesError) {
      console.error("Categories error:", categoriesError);

      return NextResponse.json(
        {
          error: "Could not load job categories.",
          details: categoriesError.message,
        },
        { status: 500 }
      );
    }

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { error: "No categories in dataset" },
        { status: 500 }
      );
    }

    // ------------------------------------------------------------
    // 6. Ask Gemini to classify target role
    // ------------------------------------------------------------
    let categorySlug: string;

    try {
      const classifySystem = `
You classify a career target role into exactly one category.

Return ONLY valid JSON in this exact format:
{"slug":"category-slug"}

Choose ONLY one slug from the provided list.

Do not invent a slug.
Do not explain your answer.
`;

      const classifyUser = `
Target role: ${profile.target_role}

Available categories:
${categories.map((category) => category.slug).join(", ")}
`;

      const classifyText = await callGemini(
        classifySystem,
        classifyUser
      );

      let parsed: { slug?: string };

      try {
        parsed = JSON.parse(classifyText);
      } catch (parseError) {
        console.error(
          "Failed to parse category classification:",
          classifyText,
          parseError
        );

        throw new Error("Gemini returned invalid category JSON");
      }

      const matchedCategory = categories.find(
        (category) => category.slug === parsed.slug
      );

      if (!matchedCategory) {
        throw new Error(
          `Gemini returned invalid category slug: ${parsed.slug}`
        );
      }

      categorySlug = matchedCategory.slug;
    } catch (error) {
      console.error("Category classification failed:", error);

      return NextResponse.json(
        {
          error: "Could not classify your target role.",
          details:
            error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    const categoryLabel =
      categories.find((category) => category.slug === categorySlug)
        ?.label ?? categorySlug;

    // ------------------------------------------------------------
    // 7. Get real skill-frequency data from Supabase
    // ------------------------------------------------------------
    const { data: skillCounts, error: viewError } = await supabase
      .from("category_skill_counts")
      .select("skill, skill_count, category_job_count")
      .eq("category_slug", categorySlug)
      .order("skill_count", { ascending: false });

    if (viewError) {
      console.error("Skill view error:", viewError);

      return NextResponse.json(
        {
          error: "Could not load job-skill data.",
          details: viewError.message,
        },
        { status: 500 }
      );
    }

    if (!skillCounts || skillCounts.length === 0) {
      console.error("No skills found for category:", categorySlug);

      return NextResponse.json(
        {
          error: `No job-skill data found for ${categoryLabel}.`,
          categorySlug,
          categoryLabel,
        },
        { status: 404 }
      );
    }

    // ------------------------------------------------------------
    // 8. Debug information
    // ------------------------------------------------------------
    console.log("Growth debug:", {
      targetRole: profile.target_role,
      categorySlug,
      categoryLabel,
      skillCountRows: skillCounts.length,
      firstSkills: skillCounts.slice(0, 5),
      mySkills: [...mySkills],
    });

    // ------------------------------------------------------------
    // 9. Determine job count
    // ------------------------------------------------------------
    const jobCount = skillCounts[0]?.category_job_count ?? 0;

    // ------------------------------------------------------------
    // 10. Rank missing skills deterministically
    // ------------------------------------------------------------
    const ranked = skillCounts
      .filter(
        (skill) =>
          typeof skill.skill === "string" &&
          !mySkills.has(skill.skill.trim().toLowerCase())
      )
      .slice(0, 8)
      .map((skill) => ({
        skill: skill.skill,
        count: skill.skill_count,
      }));

    // ------------------------------------------------------------
    // 11. If the user already has the top tracked skills
    // ------------------------------------------------------------
    if (ranked.length === 0) {
      return NextResponse.json({
        ranked: [],
        jobCount,
        categoryLabel,
        reasoning:
          "Your logged skills already cover the top tracked skills for this category.",
        next_step:
          "Log more advanced or specialized work to surface deeper skill gaps.",
      });
    }

    // ------------------------------------------------------------
    // 12. Send the REAL ranked gaps to Gemini for explanation only
    // ------------------------------------------------------------
    const gapList = ranked
      .map(
        (item) =>
          `${item.skill} (appears in ${item.count} of ${jobCount} postings)`
      )
      .join("; ");

    const mySkillsList =
      [...mySkills].sort().join(", ") || "No skills logged yet";

    let reasoning = "";
    let next_step = "";

    try {
      const explanationSystem = `
You are a career advisor.

The skill ranking below has already been calculated from real job-posting
frequency data.

Your job is ONLY to:
1. Explain the pattern in the ranked gaps.
2. Give one concrete next action for the highest-ranked gap.

Rules:
- Do NOT invent skills.
- Do NOT add skills that are not in the ranked list.
- Do NOT reorder the ranked skills.
- Do NOT change the frequency counts.
- Do NOT claim the user knows a skill unless it appears in their existing skills.
- Keep the recommendation practical and specific.

Return ONLY valid JSON in exactly this format:
{
  "reasoning": "2-3 concise sentences",
  "next_step": "one concrete action"
}
`;

      const explanationUser = `
Target role: ${profile.target_role}

Matched job category: ${categoryLabel}

Skills the user already has:
${mySkillsList}

Ranked missing skills based on job-posting frequency:
${gapList}
`;

      const resultText = await callGemini(
        explanationSystem,
        explanationUser
      );

      let parsed: {
        reasoning?: string;
        next_step?: string;
      };

      try {
        parsed = JSON.parse(resultText);
      } catch (parseError) {
        console.error(
          "Failed to parse explanation JSON:",
          resultText,
          parseError
        );

        throw new Error("Gemini returned invalid explanation JSON");
      }

      reasoning =
        typeof parsed.reasoning === "string"
          ? parsed.reasoning
          : "";

      next_step =
        typeof parsed.next_step === "string"
          ? parsed.next_step
          : "";
    } catch (error) {
      console.error("Gemini explanation failed:", error);

      // The important part:
      // skill ranking still works even when Gemini's explanation fails.
      reasoning =
        "The ranking below is calculated directly from real job-posting frequency data. The written explanation could not be generated.";

      next_step = `Focus on ${ranked[0].skill}, the highest-frequency missing skill.`;
    }

    // ------------------------------------------------------------
    // 13. Return final result
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
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}