import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { raw } = await request.json();
  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "Missing 'raw'" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, target_role, voice")
    .eq("id", user.id)
    .single();

  const system = `You turn a raw career update into structured data, a LinkedIn post, and a resume bullet.
Person: ${profile?.name}, targeting: ${profile?.target_role}. Post voice: ${profile?.voice}.
Return a JSON object with this exact shape:
{"title":"short title, under 8 words","type":"project|certification|course|job|award","domain":"one or two word category","skills":["skill1","skill2"],"impact_metric":"a measurable outcome if present in the input, else empty string","post":"a recruiter-friendly LinkedIn post, 80-150 words, in the requested voice, no hashtags spam (max 3 relevant ones at the end), no emoji overload (0-1 max)","resume_bullet":"one polished resume bullet, action-verb led, under 30 words"}
If the input lacks detail, still produce a strong, honest bullet and post without inventing fake numbers.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: raw }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

