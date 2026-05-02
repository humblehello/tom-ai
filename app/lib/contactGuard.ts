import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type GuardResult = "allow" | "blocked" | "requeue";

export async function contactImportGuard(
  userId: string,
  email: string,
  fullName: string,
  source: string,
  rawData?: any
): Promise<GuardResult> {
  const domain = email.split("@")[1] || "";

  // 1. Check permanent blocklist (email or domain match)
  const { data: blocked } = await supabase
    .from("tom_contact_blocklist")
    .select("id")
    .eq("user_id", userId)
    .or(`email.eq.${email},domain.eq.${domain}`)
    .maybeSingle();
  if (blocked) return "blocked";

  // 2. Check deleted contacts
  const { data: wasDeleted } = await supabase
    .from("tom_deleted_contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("email", email)
    .maybeSingle();

  if (wasDeleted) {
    const { data: alreadyQueued } = await supabase
      .from("tom_contact_requeue")
      .select("id")
      .eq("user_id", userId)
      .eq("email", email)
      .is("decision", null)
      .maybeSingle();

    if (!alreadyQueued) {
      await supabase.from("tom_contact_requeue").insert({
        user_id: userId,
        full_name: fullName,
        email: email,
        source,
        reason: `Previously deleted — re-detected via ${source}`,
        raw_data: rawData || {},
      });
    }
    return "requeue";
  }

  return "allow";
}

export async function recordContactDeletion(
  userId: string,
  email: string,
  fullName: string
) {
  const domain = email.split("@")[1] || "";

  const DOMAIN_SAFELIST = [
    "gmail.com", "googlemail.com",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "yahoo.co.uk",
    "icloud.com", "me.com", "mac.com",
    "aol.com", "protonmail.com", "proton.me",
    "thumbprint.com",
  ];

  if (DOMAIN_SAFELIST.includes(domain)) return;

  // Count how many contacts from this domain have been deleted
  const { count } = await supabase
    .from("tom_deleted_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .ilike("email", `%@${domain}`);

  // 3+ deletions from same domain → auto-block it
  if ((count || 0) >= 3) {
    const { data: alreadyBlocked } = await supabase
      .from("tom_contact_blocklist")
      .select("id")
      .eq("user_id", userId)
      .eq("domain", domain)
      .maybeSingle();

    if (!alreadyBlocked) {
      await supabase.from("tom_contact_blocklist").insert({
        user_id: userId,
        domain,
        reason: `Auto-blocked: ${count} contacts deleted from this domain`,
      });
    }
  }
}