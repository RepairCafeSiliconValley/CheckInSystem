export const CATEGORIES = [
  "Basic Appliances / Lamp",
  "Bikes",
  "Computer / Phone",
  "Electronics",
  "Furniture / Wood",
  "Jewelry",
  "Mechanical",
  "Sewing / Textiles",
  "Special Skills",
  "Other",
];

// Work-order statuses, in pipeline order. `key` is the value stored in the DB;
// `label` is the only thing ever shown to a human. Renaming a label here is
// display-only and needs no migration.
//   pending            — checked in, ticket not printed yet
//   pending_assignment — ticket printed, waiting for a fixer
//   assigned           — a fixer scanned the claim QR and started work
//   completed          — an outcome was recorded
//   canceled           — left before it was worked (reason in cancel_reason)
// 'assigned' is written by the claim-and-notify Edge Function (see the
// twilio-integration branch), not by this app directly. It reads as a harmless
// zero anywhere that flow isn't in use.
export const STATUSES = [
  { key: "pending", label: "Submitted", color: "#b54708", bg: "#fef6ee" },
  { key: "pending_assignment", label: "Checked-In", color: "#1e3a6e", bg: "#eef2f8" },
  { key: "assigned", label: "With Fixer", color: "#6941c6", bg: "#f4f3ff" },
  { key: "completed", label: "Completed", color: "#2e7d32", bg: "#e8f5e9" },
  { key: "canceled", label: "Cancelled", color: "#667085", bg: "#f2f4f7" },
];

// Recording an outcome always moves a work order to status='completed'.
export const OUTCOMES = ["Fixed", "Diagnosed", "Not Fixed", "Taken Home"];

// Display colors for each outcome, shared by badges, stat bars and charts.
export const OUTCOME_COLORS = {
  Fixed: "#2e7d32",
  Diagnosed: "#b54708",
  "Not Fixed": "#b42318",
  "Taken Home": "#98a2b3",
};

// Canceling (status='canceled', outcome stays NULL) records one of these reasons.
// Staff-only; a coordinator can cancel at any point before an outcome is recorded.
export const CANCEL_REASONS = [
  "Disallowed Item",
  "Registration Closed",
  "Mistake",
  "Never Checked In",
  "Client left",
  "Languished",
];

// When the outcome is "Not Fixed", one of these is stored in not_fixed_reason.
export const NOT_FIXED_REASONS = [
  "Spare parts not available",
  "Spare parts too expensive",
  "No way to open product",
  "Repair information not available",
  "Lack of equipment",
  "Item too worn out",
  "Beyond scope of event",
  "Not enough time",
];

// ─── Waiver ───
// IMPORTANT: When changing WAIVER_SECTIONS text below, you MUST bump
// WAIVER_VERSION (e.g. "1.0" → "1.1"). This ensures the audit trail
// correctly tracks which version each visitor agreed to.

export const WAIVER_VERSION = "1.0";

export const WAIVER_SECTIONS = [
  {
    heading: "No Guarantee of Repair",
    body: "I understand that I will be assisted by volunteers, and there is no guarantee that my item will be successfully repaired or function properly after the repair attempt.",
  },
  {
    heading: "Assumption of Risk",
    body: "I acknowledge that any repair attempt carries the risk of further damage to my item and that the organizers and volunteers are not responsible for any resulting damage or loss of function.",
  },
  {
    heading: "Release of Liability",
    body: "I release and hold harmless Repair Café Silicon Valley, its volunteers, and any affiliated entities from any and all claims, liabilities, damages, or losses related to the repair attempt, including but not limited to accidental damage or failure of the item.",
  },
  {
    heading: "Personal Safety",
    body: "I acknowledge that I am responsible for my own safety and agree to follow all safety guidelines provided by the organizers during the repair process.",
  },
  {
    heading: "No Warranty",
    body: "I understand that any repairs made during the event are performed as a goodwill service and do not come with any warranty or guarantee.",
  },
  {
    heading: "Item Ownership & Responsibility",
    body: "I affirm that I am the rightful owner of the item being repaired and take full responsibility for it during and after the repair attempt.",
  },
  {
    heading: "Unrepairable Items",
    body: "I understand that if my item cannot be repaired, I am responsible for taking it with me and properly disposing of or recycling it myself.",
  },
  {
    heading: "Photo Release",
    body: "I grant permission to photograph or record me during the event and to use my image, likeness, or voice for promotional, educational, or informational purposes.",
  },
];

export function getWaiverFullText() {
  return WAIVER_SECTIONS.map((s) => `${s.heading}: ${s.body}`).join("\n\n");
}

export async function computeWaiverHash() {
  const fullText = WAIVER_VERSION + "|" + getWaiverFullText();
  const data = new TextEncoder().encode(fullText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
