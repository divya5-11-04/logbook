import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug, label")
    .order("label");

  const { data: entries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardClient
      profile={profile ?? { name: user.email, target_role: "Not set", voice: "direct and understated" }}
      categories={categories ?? []}
      initialEntries={entries ?? []}
      userEmail={user.email ?? ""}
    />
  );
}
