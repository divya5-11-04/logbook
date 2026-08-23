// Loads the Kaggle "job-skill-set" CSV (all_job_post.csv) into the job_postings table.
// Usage:
//   1. Place all_job_post.csv in the project root (or pass a path as the first arg)
//   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment (or .env)
//   3. npm run seed

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const CSV_PATH = process.argv[2] || path.join(process.cwd(), "all_job_post.csv");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your environment.");
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found at ${CSV_PATH}. Pass a path: npm run seed -- /path/to/all_job_post.csv`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// The dataset's category column (e.g. "INFORMATION-TECHNOLOGY") maps directly
// to the slug format used in the categories table.
function slugFromDatasetCategory(cat) {
  return cat.trim().toLowerCase();
}

function parseSkillList(raw) {
  // The CSV stores skills as a Python-style list string, e.g. "['SQL', 'Excel']"
  try {
    const cleaned = raw
      .trim()
      .replace(/^\[|\]$/g, "")
      .split(/',\s*'|",\s*"/)
      .map((s) => s.replace(/^['"]|['"]$/g, "").trim())
      .filter(Boolean);
    return cleaned;
  } catch {
    return [];
  }
}

async function main() {
  console.log(`Reading ${CSV_PATH}...`);
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  console.log(`Parsed ${rows.length} rows.`);

  const { data: categories, error: catErr } = await supabase.from("categories").select("id, slug");
  if (catErr) throw catErr;
  const slugToId = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const batch = [];
  let skipped = 0;

  for (const row of rows) {
    const slug = slugFromDatasetCategory(row.category);
    const categoryId = slugToId[slug];
    if (!categoryId) {
      skipped++;
      continue;
    }
    const skills = parseSkillList(row.job_skill_set);
    if (skills.length === 0) {
      skipped++;
      continue;
    }
    batch.push({
      category_id: categoryId,
      title: row.job_title,
      skills,
      is_seed: true,
      added_by: null,
    });
  }

  console.log(`Inserting ${batch.length} postings (${skipped} skipped — unrecognized category or no skills)...`);

  const chunkSize = 500;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from("job_postings").insert(chunk);
    if (error) throw error;
    console.log(`  inserted ${Math.min(i + chunkSize, batch.length)} / ${batch.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
