import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

async function callClaude(prompt: string, maxTokens = 1000): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.error("Claude API error:", res.status, JSON.stringify(data)); return "{}"; }
  return data.content?.[0]?.text || "{}";
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query, execute, action, contact_ids, mode } = await req.json();

  // ── Execute confirmed action ──────────────────────────────────────────────
  if (execute && action && contact_ids?.length > 0) {
    return executeAction(userId, action, contact_ids);
  }

  if (!query?.trim()) return NextResponse.json({ results: [], mode: "empty" });

  // ── mode: "search" = Enter key, strict literal search ────────────────────
  if (mode === "search" || !mode) {
    return handleLiteralSearch(userId, query.trim());
  }

  // ── mode: "ai" Humble Hello button, Claude-powered commands ──────────────────
  return handleAiCommand(userId, query.trim());
}

// ── LITERAL SEARCH (Enter key) ────────────────────────────────────────────────
async function handleLiteralSearch(userId: string, query: string) {
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("*")
    .eq("user_id", userId)
    .not("full_name", "is", null)
    .range(0, 99999);

  if (!contacts?.length) return NextResponse.json({ results: [], mode: "search" });

  const q = query.toLowerCase().trim();

  const isDomain = /^@[\w.-]+\.[a-z]{2,}$/.test(q) || /^[\w.-]+\.[a-z]{2,}$/.test(q);
  const isEmail = q.includes("@") && q.includes(".");
  const isPhone = /^[\d\s().+-]{7,}$/.test(q);
  const isName = /^[a-z]+ [a-z]+$/i.test(q.trim()) && !q.includes("@") && !q.includes(".");

  let results: any[] = [];

  if (isDomain) {
    const domain = q.replace(/^@/, "");
    results = contacts.filter(c =>
      c.email?.toLowerCase().includes(domain) ||
      (c.all_emails || []).some((e: string) => e.toLowerCase().includes(domain))
    );
  } else if (isEmail) {
    results = contacts.filter(c =>
      c.email?.toLowerCase().includes(q) ||
      (c.all_emails || []).some((e: string) => e.toLowerCase().includes(q))
    );
  } else if (isPhone) {
    const digits = q.replace(/\D/g, "");
    results = contacts.filter(c =>
      c.phone?.replace(/\D/g, "").includes(digits) ||
      (c.all_phones || []).some((p: string) => p.replace(/\D/g, "").includes(digits))
    );
  } else if (isName) {
    const nameParts = q.split(/\s+/);
    results = contacts.filter(c => {
      const name = c.full_name?.toLowerCase() || "";
      if (name === q) return true;
      if (nameParts.every((p: string) => name.includes(p))) return true;
      if (c.company?.toLowerCase() === q) return true;
      return false;
    });
    if (results.length === 0) {
      results = contacts.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q)
      );
    }
  } else {
    results = contacts.filter(c =>
      c.full_name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.job_title?.toLowerCase().includes(q) ||
      (c.home_address?.city || "").toLowerCase().includes(q) ||
      (c.home_address?.region || "").toLowerCase().includes(q) ||
      (c.topics || []).some((t: string) => t.toLowerCase().includes(q)) ||
      (c.tags || []).some((t: any) => (t.value || t.tag || "").toLowerCase().includes(q)) ||
      (c.key_context || "").toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q)
    );
  }

  results.sort((a, b) => {
    const aExact = a.full_name?.toLowerCase() === q || a.company?.toLowerCase() === q ? 0 : 1;
    const bExact = b.full_name?.toLowerCase() === q || b.company?.toLowerCase() === q ? 0 : 1;
    return aExact - bExact;
  });

  return NextResponse.json({
    results: results.slice(0, 100).map(c => ({ ...c, match_reason: "Search match", is_ai_match: false })),
    total: results.length,
    mode: "search",
    query,
  });
}

// ── AI COMMAND (Humble Hello button) ────────────────────────────────────────────────
async function handleAiCommand(userId: string, query: string) {
  // ── Pre-check: name search patterns ────────────────────────────────────────
  const namePatterns = [
    /last name (?:is )?([a-z]+)/i,
    /first name (?:is )?([a-z]+)/i,
    /find ([a-z]+ [a-z]*)/i,
    /show me ([a-z]+ [a-z]*)/i,
    /named? ([a-z]+ ?[a-z]*)/i,
  ];
  for (const pattern of namePatterns) {
    const match = query.match(pattern);
    if (match) {
      const nameTerm = match[1].trim();
      const literalResult = await handleLiteralSearch(userId, nameTerm);
      const data = await literalResult.json();
      if (data.results?.length > 0) return NextResponse.json({ ...data, query });
    }
  }

  const classifyPrompt = `You are a contact management AI. Classify this instruction and extract parameters.

INSTRUCTION: "${query}"

Intents:
- "search" — find contacts matching complex criteria (interests, behavior, relationship, calendar history)
- "rename_company" — change a company name across contacts
- "rename_person" — change a contact's name
- "change_email_domain" — bulk change email domain
- "update_relationship_type" — set relationship type for a group
- "bulk_tag" — add a tag to a group of contacts
- "bulk_delete" — delete contacts matching criteria
- "find_duplicates" — find contacts with duplicate names or emails
- "find_deletable" — find low quality contacts to clean up
- "find_unclassified" — find contacts with no relationship type set
- "find_missing_phone" — find contacts missing a phone number
- "find_missing_email" — find contacts missing an email
- "find_vip" — find highest priority contacts (close friends, family, high strength)
- "find_neglected" — find important contacts not reached out to recently
- "find_priority_outreach" — who should I reach out to this week

Examples:
"people who play golf" → {"intent":"search","search_query":"golf players"}
"customers I haven't emailed in 6 months" → {"intent":"search","search_query":"customers no email 180 days"}
"show me contacts with dogs" → {"intent":"search","search_query":"has dog pet"}
"contacts I had lunch with" → {"intent":"search","search_query":"lunch meeting shared event"}
"rename Thumbprint to Acme Corp" → {"intent":"rename_company","from":"Thumbprint","to":"Acme Corp"}
"change @screenbroidery.com to @thumbprint.com" → {"intent":"change_email_domain","from_domain":"screenbroidery.com","to_domain":"thumbprint.com"}
"tag everyone at Nike as customer" → {"intent":"update_relationship_type","filter":"Nike","relationship_type":"customer"}
"add VIP tag to my close friends" → {"intent":"bulk_tag","filter":"close_friend","tag":"VIP"}
"delete contacts I've never emailed" → {"intent":"bulk_delete","filter":"never_emailed"}
"rename John Smith to Jonathan Smith" → {"intent":"rename_person","from_name":"John Smith","to_first":"Jonathan","to_last":"Smith"}
"find duplicates" → {"intent":"find_duplicates"}
"merge duplicates" → {"intent":"find_duplicates"}
"which contacts should I delete" → {"intent":"find_deletable"}
"who hasn't been classified" → {"intent":"find_unclassified"}
"contacts missing phone number" → {"intent":"find_missing_phone"}
"show me my VIP contacts" → {"intent":"find_vip"}
"who should I reach out to this week" → {"intent":"find_priority_outreach"}
"show me neglected relationships" → {"intent":"find_neglected"}

Respond ONLY with JSON:
{"intent":"...","search_query":"...","from":"...","to":"...","from_domain":"...","to_domain":"...","filter":"...","relationship_type":"...","tag":"...","from_name":"...","to_first":"...","to_last":"..."}`;

  const classifyText = await callClaude(classifyPrompt, 300);
  let classification: any = {};
  try {
    classification = JSON.parse(classifyText.replace(/```json|```/g, "").trim());
  } catch {
    classification = { intent: "search", search_query: query };
  }

  const intent = classification.intent || "search";

  if (intent === "search") {
    return handleSemanticSearch(userId, classification.search_query || query, query);
  }

  const taskIntents = ["find_duplicates", "find_deletable", "find_unclassified",
    "find_missing_phone", "find_missing_email", "find_vip", "find_neglected", "find_priority_outreach"];

  if (taskIntents.includes(intent)) {
    return handleDatabaseTask(userId, intent, classification.filter);
  }

  return handleActionPreview(userId, intent, classification, query);
}

// ── SEMANTIC SEARCH (Tom AI search intent) ───────────────────────────────────
async function handleSemanticSearch(userId: string, searchQuery: string, originalQuery: string) {
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("*")
    .eq("user_id", userId)
    .not("full_name", "is", null)
    .range(0, 99999);

  if (!contacts?.length) return NextResponse.json({ results: [], mode: "search" });

const enriched = contacts;

  let aiMatchedIds: string[] = [];
  let aiReasoning: Record<string, string> = {};

  if (enriched.length > 0) {
    const contactSummaries = enriched.map(c => ({
      id: c.id,
      name: c.full_name,
      company: c.company || "",
      job_title: c.job_title || "",
      email_domain: c.email?.split("@")[1] || "",
      city: c.home_address?.city || c.work_address?.city || "",
      relationship_type: c.relationship_type || "",
      last_emailed_days: c.last_emailed_at
        ? Math.floor((Date.now() - new Date(c.last_emailed_at).getTime()) / 86400000)
        : null,
      shared_events_count: c.shared_events?.length || 0,
      summary: [
        c.key_context,
        (c.tags || []).map((t: any) => t.value || t.tag).join(", "),
        (c.topics || []).join(", "),
        c.intelligence ? JSON.stringify(c.intelligence).slice(0, 200) : ""
      ].filter(Boolean).join(" | ").slice(0, 500),
    }));

    const BATCH_SIZE = 200;
    for (let i = 0; i < contactSummaries.length; i += BATCH_SIZE) {
      const batch = contactSummaries.slice(i, i + BATCH_SIZE);
      const prompt = `Find contacts matching: "${originalQuery}"
Search hint: "${searchQuery}"

CONTACTS:
${JSON.stringify(batch, null, 2)}

Be semantic and strict. Only return genuine matches. Brief reason per match.

Respond ONLY in JSON:
{"matches":[{"id":"uuid","reason":"one sentence reason"}]}`;

      const text = await callClaude(prompt, 1000);
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        for (const match of parsed.matches || []) {
          if (match.id && !aiMatchedIds.includes(match.id)) {
            aiMatchedIds.push(match.id);
            aiReasoning[match.id] = match.reason;
          }
        }
      } catch { /* continue */ }
    }
  }

  if (aiMatchedIds.length === 0) {
    return NextResponse.json({ results: [], mode: "search", query: originalQuery });
  }

  const results = aiMatchedIds.map(id => {
    const contact = contacts?.find(c => c.id === id);
    return { ...contact, match_reason: aiReasoning[id], is_ai_match: true };
  }).filter(r => r.id);

  return NextResponse.json({ results, total: results.length, mode: "search", query: originalQuery });
}

// ── DATABASE TASKS ────────────────────────────────────────────────────────────
async function handleDatabaseTask(userId: string, intent: string, filter?: string) {
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("*")
    .eq("user_id", userId)
    .not("full_name", "is", null)
    .range(0, 99999);

  if (!contacts?.length) return NextResponse.json({ results: [], mode: "search" });

  let results: any[] = [];
  let taskDescription = "";

  const daysAgo = (dateStr?: string) => {
    if (!dateStr) return 999;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  switch (intent) {
    case "find_duplicates": {
      const nameMap: Record<string, any[]> = {};
      const emailMap: Record<string, any[]> = {};
      for (const c of contacts) {
        const name = c.full_name?.toLowerCase().trim();
        if (name) { nameMap[name] = nameMap[name] || []; nameMap[name].push(c); }
        const email = c.email?.toLowerCase().trim();
        if (email) { emailMap[email] = emailMap[email] || []; emailMap[email].push(c); }
      }
      const dupIds = new Set<string>();
      for (const group of Object.values(nameMap)) { if (group.length > 1) group.forEach(c => dupIds.add(c.id)); }
      for (const group of Object.values(emailMap)) { if (group.length > 1) group.forEach(c => dupIds.add(c.id)); }
      results = contacts.filter(c => dupIds.has(c.id));
      taskDescription = `Found ${results.length} potential duplicate contacts`;
      break;
    }
    case "find_deletable": {
      results = contacts.filter(c => {
        if (!c.email && !c.phone) return true;
        if (!c.email && daysAgo(c.last_emailed_at) === 999) return true;
        if (daysAgo(c.last_emailed_at) > 1095 && !c.relationship_type && !c.key_context) return true;
        return false;
      }).slice(0, 100);
      taskDescription = `Found ${results.length} contacts that could be cleaned up`;
      break;
    }
    case "find_unclassified": {
      results = contacts
        .filter(c => !c.relationship_type)
        .sort((a, b) => (b.email_count || 0) - (a.email_count || 0))
        .slice(0, 100);
      taskDescription = `Found ${results.length} contacts without a relationship type`;
      break;
    }
    case "find_missing_phone": {
      results = contacts
        .filter(c => !c.phone && c.email)
        .sort((a, b) => (b.relationship_strength || 0) - (a.relationship_strength || 0))
        .slice(0, 100);
      taskDescription = `Found ${results.length} contacts missing a phone number`;
      break;
    }
    case "find_missing_email": {
      results = contacts.filter(c => !c.email).slice(0, 100);
      taskDescription = `Found ${results.length} contacts missing an email`;
      break;
    }
    case "find_vip": {
      const filterType = filter?.toLowerCase();
      results = contacts
        .filter(c => {
          if (filterType && !c.relationship_type?.toLowerCase().includes(filterType) &&
            !c.company?.toLowerCase().includes(filterType)) return false;
          return ["family", "close_friend", "friend"].includes(c.relationship_type || "") ||
            (c.relationship_strength || 0) >= 70;
        })
        .sort((a, b) => {
          const typeOrder = (t?: string) => ({ family: 0, close_friend: 1, friend: 2 }[t || ""] ?? 3);
          const typeDiff = typeOrder(a.relationship_type) - typeOrder(b.relationship_type);
          return typeDiff !== 0 ? typeDiff : (b.relationship_strength || 0) - (a.relationship_strength || 0);
        })
        .slice(0, 50);
      taskDescription = `Found ${results.length} VIP contacts`;
      break;
    }
    case "find_neglected": {
      results = contacts
        .filter(c => {
          const days = daysAgo(c.last_emailed_at);
          const isImportant = ["family", "close_friend", "friend", "customer"].includes(c.relationship_type || "");
          return isImportant && days > 60 && days < 730;
        })
        .sort((a, b) => (b.relationship_strength || 0) - (a.relationship_strength || 0))
        .slice(0, 50);
      taskDescription = `Found ${results.length} important contacts you haven't reached out to recently`;
      break;
    }
    case "find_priority_outreach": {
      results = contacts
        .filter(c => {
          const days = daysAgo(c.last_emailed_at);
          return (c.relationship_strength || 0) >= 40 && days >= 30 && days <= 180 && c.email;
        })
        .sort((a, b) => (b.relationship_strength || 0) - (a.relationship_strength || 0))
        .slice(0, 20);
      taskDescription = `Found ${results.length} contacts you should reach out to this week`;
      break;
    }
  }

  return NextResponse.json({
    results: results.map(c => ({ ...c, match_reason: taskDescription, is_ai_match: true })),
    total: results.length,
    mode: "search",
    task_description: taskDescription,
    query: taskDescription,
  });
}

// ── ACTION PREVIEW ────────────────────────────────────────────────────────────
async function handleActionPreview(userId: string, intent: string, params: any, originalQuery: string) {
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, full_name, company, job_title, email, relationship_type, all_emails, last_emailed_at")
    .eq("user_id", userId)
    .not("full_name", "is", null)
    .range(0, 99999);

  if (!contacts?.length) return NextResponse.json({ mode: "action", affected: [], intent, params });

  let affected: any[] = [];
  let description = "";
  let changePreview: (c: any) => string = () => "";

  switch (intent) {
    case "rename_company": {
      const from = params.from?.toLowerCase();
      affected = contacts.filter(c => c.company?.toLowerCase().includes(from));
      description = `Rename company "${params.from}" → "${params.to}"`;
      changePreview = c => `${c.company} → ${params.to}`;
      break;
    }
    case "rename_person": {
      const fromName = params.from_name?.toLowerCase();
      affected = contacts.filter(c => c.full_name?.toLowerCase().includes(fromName));
      description = `Rename "${params.from_name}" → "${[params.to_first, params.to_last].filter(Boolean).join(" ")}"`;
      changePreview = c => `${c.full_name} → ${[params.to_first, params.to_last].filter(Boolean).join(" ")}`;
      break;
    }
    case "change_email_domain": {
      const fromDomain = params.from_domain?.toLowerCase();
      affected = contacts.filter(c =>
        c.email?.toLowerCase().endsWith(`@${fromDomain}`) ||
        (c.all_emails || []).some((e: string) => e.toLowerCase().endsWith(`@${fromDomain}`))
      );
      description = `Change email domain @${params.from_domain} → @${params.to_domain}`;
      changePreview = c => `${c.email} → ${c.email?.replace(params.from_domain, params.to_domain)}`;
      break;
    }
    case "update_relationship_type": {
      const filter = params.filter?.toLowerCase();
      affected = contacts.filter(c =>
        c.company?.toLowerCase().includes(filter) ||
        c.relationship_type?.toLowerCase().includes(filter) ||
        c.full_name?.toLowerCase().includes(filter)
      );
      description = `Set relationship type → "${params.relationship_type}"`;
      changePreview = c => `${c.relationship_type || "unset"} → ${params.relationship_type}`;
      break;
    }
    case "bulk_tag": {
      const filter = params.filter?.toLowerCase();
      affected = contacts.filter(c =>
        c.company?.toLowerCase().includes(filter) ||
        c.relationship_type?.toLowerCase().includes(filter) ||
        c.full_name?.toLowerCase().includes(filter) ||
        (filter === "close friends" && c.relationship_type === "close_friend") ||
        (filter === "close_friend" && c.relationship_type === "close_friend") ||
        (filter === "customers" && c.relationship_type === "customer") ||
        (filter === "customer" && c.relationship_type === "customer")
      );
      description = `Add tag "${params.tag}" to ${affected.length} contacts`;
      changePreview = () => `Add tag: ${params.tag}`;
      break;
    }
    case "bulk_delete": {
      if (params.filter === "never_emailed") {
        affected = contacts.filter(c => !c.last_emailed_at);
        description = `Delete ${affected.length} contacts never emailed`;
        changePreview = () => "Will be deleted";
      }
      break;
    }
    default:
      return NextResponse.json({ mode: "search_fallback", query: originalQuery });
  }

  return NextResponse.json({
    mode: "action",
    intent,
    params,
    description,
    affected: affected.map(c => ({
      id: c.id,
      full_name: c.full_name,
      company: c.company,
      job_title: c.job_title,
      email: c.email,
      relationship_type: c.relationship_type,
      change_preview: changePreview(c),
    })),
    original_query: originalQuery,
  });
}

// ── EXECUTE ACTION ────────────────────────────────────────────────────────────
async function executeAction(userId: string, action: any, contactIds: string[]) {
  const { intent, params } = action;
  let updated = 0;

  for (const id of contactIds) {
    let patch: any = {};

    switch (intent) {
      case "rename_company":
        patch = { company: params.to };
        break;
      case "rename_person":
        patch = { full_name: [params.to_first, params.to_last].filter(Boolean).join(" ") };
        break;
      case "change_email_domain": {
        const { data: c } = await supabase.from("tom_contacts").select("email, all_emails").eq("id", id).single();
        if (c) {
          patch = {
            email: c.email?.replace(`@${params.from_domain}`, `@${params.to_domain}`),
            all_emails: (c.all_emails || []).map((e: string) => e.replace(`@${params.from_domain}`, `@${params.to_domain}`)),
          };
        }
        break;
      }
      case "update_relationship_type":
        patch = { relationship_type: params.relationship_type };
        break;
      case "bulk_tag": {
        const { data: c } = await supabase.from("tom_contacts").select("tags").eq("id", id).single();
        const existingTags = c?.tags || [];
        const newTag = { tag: params.tag, value: params.tag, confidence: 100, source: "manual" };
        patch = { tags: [...existingTags, newTag] };
        break;
      }
      case "bulk_delete":
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts/google-sync?contact_id=${id}`, { method: "DELETE" });
        updated++;
        continue;
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("tom_contacts").update(patch).eq("id", id).eq("user_id", userId);
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated, intent });
}