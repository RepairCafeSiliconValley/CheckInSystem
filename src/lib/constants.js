export const CATEGORIES = [
  "Electronics", "Clothing & Textiles", "Appliances", "Furniture",
  "Jewelry", "Bikes", "Toys", "Other",
];

export const OUTCOMES = ["Fixed", "Diagnosed", "Out of Scope", "Not Fixable"];

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
