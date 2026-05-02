import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Ask Claude to parse the command ──────────────────────────────────────────
async function parseCommand(command: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are Humble Hello's command parser. Parse this natural language command into a structured action plan.

Command: "${command}"

Return ONLY valid JSON with this structure:
{
  "action": "query" | "update" | "tag" | "mixed",
  "description": "human readable description of what will happen",
  "filter": {
    "email_contains": "string or null",
    "email_domain": "string or null", 
    "company": "string or null",
    "zip_code": "string or null",
    "city": "string or null",
    "state": "string or null",
    "relationship_type": "string or null",
    "has_tag": "string or null",
    "notes_contains": "string or null",
    "key_context_contains": "string or null",
    "topics_contains": "string or null",
    "last_emailed_days": number or null,
    "no_email_days": number or null
  },
  "updates": {
    "email_domain_replace": ["old_domain", "new_domain"] or null,
    "company": "string or null",
    "relationship_type": "string or null",
    "add_tag": {"tag": "string", "value": "string", "source": "command", "confidence": 90} or null,
    "remove_tag": "tag_name or null",
    "add_topic": "string or null",
    "set_eligible": "gifting | card | lunch | coffee | null",
    "notes_append": "string or null",
    "key_context_append": "string or null"
  } or null
}

Examples:
- "find all contacts with screenbroidery.com email and change to thumbprint.com and set company to Thumbprint" →
  action: "update", filter: {email_domain: "screenbroidery.com"}, updates: {email_domain_replace: ["screenbroidery.com", "thumbprint.com"], company: "Thumbprint"}

- "show contacts in zip 46204" →
  action: "query", filter: {zip_code: "46204"}, updates: null

- "mark all contacts in Indianapolis as coffee eligible" →
  action: "tag", filter: {city: "Indianapolis"}, updates: {add_tag: {tag: "coffee_eligible", value: "eligible for coffee meeting", source: "command", confidence: 90}}

- "contacts I had lunch or dinner with in the last 60 days" →
  action: "query", filter: {notes_contains: "lunch|dinner", last_emailed_days: 60}, updates: null

Return ONLY the JSON object, no markdown.`,
      }],
    }),
  });

  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

// ── Build Supabase query from filter ─────────────────────────────────────────
async function getMatchingContacts(userId: string, filter: any): Promise<any[]> {
  let query = supabase
    .from("tom_contacts")
    .select("id, full_name, email, company, relationship_type, notes, key_context, topics, tags, home_address, last_emailed_at")
    .eq("user_id", userId);

  if (filter.email_domain) {
    query = query.ilike("email", `%@${filter.email_domain}`);
  }
  if (filter.email_contains) {
    query = query.ilike("email", `%${filter.email_contains}%`);
  }
  if (filter.company) {
    query = query.ilike("company", `%${filter.company}%`);
  }
  if (filter.zip_code) {
    query = query.eq("home_address->>postalCode", filter.zip_code);
  }
  if (filter.city) {
    query = query.ilike("home_address->>city", `%${filter.city}%`);
  }
  if (filter.state) {
    query = query.ilike("home_address->>region", `%${filter.state}%`);
  }
  if (filter.relationship_type) {
    query = query.eq("relationship_type", filter.relationship_type);
  }
  if (filter.notes_contains) {
    // Handle pipe-separated OR conditions
    const terms = filter.notes_contains.split("|");
    if (terms.length === 1) {
      query = query.ilike("notes", `%${terms[0]}%`);
    }
    // For multiple terms, filter in memory after fetch
  }
  if (filter.key_context_contains) {
    query = query.ilike("key_context", `%${filter.key_context_contains}%`);
  }
  if (filter.last_emailed_days) {
    const cutoff = new Date(Date.now() - filter.last_emailed_days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("last_emailed_at", cutoff);
  }
  if (filter.no_email_days) {
    const cutoff = new Date(Date.now() - filter.no_email_days * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt("last_emailed_at", cutoff);
  }

  query = query.limit(500);
  const { data } = await query;
  let results = data || [];

  // Post-filter for pipe OR conditions
  if (filter.notes_contains?.includes("|")) {
    const terms = filter.notes_contains.split("|").map((t: string) => t.toLowerCase().trim());
    results = results.filter(c =>
      terms.some((term: string) =>
        c.notes?.toLowerCase().includes(term) ||
        c.key_context?.toLowerCase().includes(term) ||
        c.topics?.some((t: string) => t.toLowerCase().includes(term))
      )
    );
  }

  if (filter.topics_contains) {
    const term = filter.topics_contains.toLowerCase();
    results = results.filter(c =>
      c.topics?.some((t: string) => t.toLowerCase().includes(term))
    );
  }

  if (filter.has_tag) {
    const term = filter.has_tag.toLowerCase();
    results = results.filter(c =>
      c.tags?.some((t: any) => t.tag?.toLowerCase().includes(term) || t.value?.toLowerCase().includes(term))
    );
  }

  return results;
}

// ── Execute updates on matched contacts ──────────────────────────────────────
async function executeUpdates(
  userId: string,
  contacts: any[],
  updates: any,
  command: string
): Promise<{ updated: number; undoId: string }> {

  // Save previous values for undo
  const previousValues: Record<string, any> = {};
  for (const c of contacts) {
    previousValues[c.id] = {
      email: c.email,
      company: c.company,
      relationship_type: c.relationship_type,
      notes: c.notes,
      key_context: c.key_context,
      topics: c.topics,
      tags: c.tags,
    };
  }

  // Save to undo table
  const { data: undoRecord } = await supabase
    .from("tom_command_undo")
    .insert({
      user_id: userId,
      command,
      affected_contact_ids: contacts.map(c => c.id),
      previous_values: previousValues,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  const undoId = undoRecord?.id || "";

  // Apply updates in batches of 50
  const BATCH = 50;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH);
    const batchUpdates = batch.map(contact => {
      const update: any = { id: contact.id, user_id: userId };

      if (updates.email_domain_replace) {
        const [oldDomain, newDomain] = updates.email_domain_replace;
        if (contact.email?.includes(`@${oldDomain}`)) {
          update.email = contact.email.replace(`@${oldDomain}`, `@${newDomain}`);
        }
      }
      if (updates.company) update.company = updates.company;
      if (updates.relationship_type) update.relationship_type = updates.relationship_type;

      if (updates.add_tag) {
        const existingTags = contact.tags || [];
        const alreadyHas = existingTags.some((t: any) => t.tag === updates.add_tag.tag);
        if (!alreadyHas) {
          update.tags = [...existingTags, updates.add_tag];
        }
      }

      if (updates.remove_tag) {
        update.tags = (contact.tags || []).filter((t: any) => t.tag !== updates.remove_tag);
      }

      if (updates.add_topic) {
        const existingTopics = contact.topics || [];
        if (!existingTopics.includes(updates.add_topic)) {
          update.topics = [...existingTopics, updates.add_topic];
        }
      }

      if (updates.notes_append && contact.notes) {
        update.notes = `${contact.notes}\n\n${updates.notes_append}`;
      } else if (updates.notes_append) {
        update.notes = updates.notes_append;
      }

      if (updates.key_context_append && contact.key_context) {
        update.key_context = `${contact.key_context}\n\n${updates.key_context_append}`;
      } else if (updates.key_context_append) {
        update.key_context = updates.key_context_append;
      }

      update.tom_ai_updated_at = new Date().toISOString();
      return update;
    });

    await supabase
      .from("tom_contacts")
      .upsert(batchUpdates, { onConflict: "id" });
  }

  return { updated: contacts.length, undoId };
}

// ── Main route ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { command } = await req.json();
  if (!command?.trim()) return NextResponse.json({ error: "No command provided" }, { status: 400 });

  // Parse the command with Claude
  const plan = await parseCommand(command);
  if (!plan) return NextResponse.json({ error: "Could not understand command" }, { status: 400 });

  // Get matching contacts
  const contacts = await getMatchingContacts(userId, plan.filter || {});

  if (contacts.length === 0) {
    return NextResponse.json({
      action: plan.action,
      description: plan.description,
      contacts: [],
      updated: 0,
      message: "No contacts matched your command.",
    });
  }

  // For query-only actions, just return the contacts
  if (plan.action === "query" || !plan.updates) {
    return NextResponse.json({
      action: "query",
      description: plan.description,
      contacts: contacts.map(c => c.id),
      count: contacts.length,
      message: `Found ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`,
    });
  }

  // Execute updates
  const { updated, undoId } = await executeUpdates(userId, contacts, plan.updates, command);

  return NextResponse.json({
    action: plan.action,
    description: plan.description,
    updated,
    undoId,
    contact_ids: contacts.map(c => c.id),
    message: `${updated} contact${updated === 1 ? "" : "s"} updated.`,
  });
}

// ── Undo route ────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const undoId = searchParams.get("undo_id");
  if (!undoId) return NextResponse.json({ error: "Missing undo_id" }, { status: 400 });

  // Get the undo record
  const { data: undo } = await supabase
    .from("tom_command_undo")
    .select("*")
    .eq("id", undoId)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!undo) {
    return NextResponse.json({ error: "Undo expired or not found" }, { status: 404 });
  }

  // Restore previous values
  const restores = Object.entries(undo.previous_values).map(([id, values]: [string, any]) => ({
    id,
    user_id: userId,
    ...values,
  }));

  const BATCH = 50;
  for (let i = 0; i < restores.length; i += BATCH) {
    await supabase
      .from("tom_contacts")
      .upsert(restores.slice(i, i + BATCH), { onConflict: "id" });
  }

  // Delete the undo record
  await supabase.from("tom_command_undo").delete().eq("id", undoId);

  return NextResponse.json({
    success: true,
    restored: restores.length,
    message: `Undone — ${restores.length} contacts restored.`,
  });
}