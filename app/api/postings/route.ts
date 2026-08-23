import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, skills } = body;
  let { category_id, new_category_label } = body;

  if (!title || !Array.isArray(skills) || skills.length === 0) {
    return NextResponse.json({ error: "Missing title or skills" }, { status: 400 });
  }

  // If the user picked "new category", create it first.
  if (!category_id && new_category_label) {
    const slug = slugify(new_category_label);
    const { data: existing } = await supabase.from("categories").select("id").eq("slug", slug).single();
    if (existing) {
      category_id = existing.id;
    } else {
      const { data: created, error: catErr } = await supabase
        .from("categories")
        .insert({ slug, label: new_category_label })
        .select()
        .single();
      if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
      category_id = created.id;
    }
  }

  if (!category_id) {
    return NextResponse.json({ error: "No category specified" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("job_postings")
    .insert({
      category_id,
      title,
      skills,
      is_seed: false,
      added_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
