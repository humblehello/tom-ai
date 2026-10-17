/** How a signature phone should be shown and stored. */
export type SignaturePhoneLabel = "cell" | "direct" | "office" | "other";

export interface LabeledPhone {
  number?: string | null;
  type?: string | null;
  label?: string | null;
}

/** List label for a stored phone. Prefers the signature label over the coarse type. */
export function phoneDisplayLabel(phone: LabeledPhone): string {
  const label = (phone.label || "").toLowerCase();
  if (label === "direct") return "direct";
  if (label === "office" || label === "main") return "office";
  if (label === "mobile" || label === "cell") return "cell";
  if (phone.type === "cell" || phone.type === "mobile") return "cell";
  if (phone.type === "direct") return "direct";
  if (phone.type === "office") return "office";
  if (phone.type === "work") return "work";
  if (phone.type === "home") return "home";
  return "phone";
}

export function phoneDisplayIcon(phone: LabeledPhone): string {
  const label = phoneDisplayLabel(phone);
  if (label === "cell") return "📱";
  if (label === "home") return "🏠";
  return "☎️";
}

/** Google People API phone type. Office is a main line, not a mobile. */
export function googlePhoneType(label: SignaturePhoneLabel | string | null | undefined): "mobile" | "work" | "main" | "other" {
  if (label === "cell" || label === "mobile") return "mobile";
  if (label === "direct" || label === "work") return "work";
  if (label === "office" || label === "main") return "main";
  return "other";
}
