import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type SyncOperation = "update" | "delete" | "create";
export type SyncDirection = "hh_to_google" | "google_to_hh";

export interface SyncAuditEntry {
  user_id: string;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  google_resource_name?: string | null;
  operation: SyncOperation;
  direction?: SyncDirection;
  fields_changed?: Record<string, any> | null;
  success: boolean;
  error_message?: string | null;
}

export async function logSyncEvent(entry: SyncAuditEntry): Promise<void> {
  try {
    await supabase.from("sync_audit_log").insert({
      ...entry,
      direction: entry.direction || "hh_to_google",
    });
  } catch (e) {
    // Log to console but never throw — audit logging must never break the main flow
    console.error("logSyncEvent failed:", e);
  }
}

// ── Helper to extract "what changed" in a format useful for audit ──
// Takes the raw updates that were sent to Google. Strips noise fields, keeps
// relevant data. Truncates long values (like notes) to keep log rows small.
export function summarizeFieldsForAudit(googleUpdates: Record<string, any>): Record<string, any> {
  const summary: Record<string, any> = {};

  for (const [key, value] of Object.entries(googleUpdates)) {
    if (value === null) {
      summary[key] = null; // Deletion
    } else if (typeof value === "string" && value.length > 200) {
      summary[key] = value.substring(0, 200) + "..."; // Truncate
    } else if (typeof value === "object" && value !== null) {
      // For objects like address, keep a compact view
      summary[key] = value;
    } else {
      summary[key] = value;
    }
  }

  return summary;
}