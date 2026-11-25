// How a ticket gets printed, and what goes on it. Pure — no React or Supabase —
// so it runs under plain node in tests/unit/printing.test.js.
//
// Two engines, picked per event in Configure Event:
//   • CloudPRNT (the default for new events): the desk queues the ticket with
//     the queue_cloudprnt_jobs RPC and the event's Star printer fetches it from
//     the cloudprnt Edge Function. Works from any device.
//   • Legacy: the browser's own print dialog, window.print().
// And independently, whether the desk sees the ticket preview first.

import { ticketUrl } from "./ticketLink.js";

// Events from before supabase-cloudprnt-migration.sql have neither column;
// they keep the old behaviour (window.print() with a preview).
export function printSettings(event) {
  return {
    legacy: event?.use_legacy_print ?? true,
    preview: event?.print_preview ?? true,
  };
}

// The ticket says REPRINT when this print isn't the item's first: its
// print_count, counting this print, is above 1.
export function isReprint(timesPrinted) {
  return Number(timesPrinted) > 1;
}

// The count a print about to happen will have: one more than the stored one.
export function nextPrintCount(workOrder) {
  return (Number(workOrder?.print_count) || 0) + 1;
}

// Canonical MAC form, the same as normalize_mac() in SQL and the cloudprnt
// Edge Function: "00:11:62:aa:bb:cc". Null when it isn't twelve hex digits.
export function normalizeMac(raw) {
  const hex = String(raw ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/../g).join(":");
}

// What the printer gets for one item: the same fields the HTML ticket shows.
// The Edge Function turns it into printer commands (starTicket.js) and adds
// REPRINT from the job's print count.
export function buildTicketSnapshot(workOrder, { attendeeName, isVolunteer, canTextClient, submittedLabel, origin }) {
  return {
    work_order_id: workOrder.id,
    submitted_label: submittedLabel || "",
    priority: workOrder.priority ?? "",
    can_text_client: Boolean(canTextClient),
    category: workOrder.category || "",
    item_name: workOrder.item_name || "",
    description: workOrder.description || "",
    client_name: attendeeName || "",
    is_volunteer: Boolean(isVolunteer),
    ticket_code: workOrder.code ? workOrder.code.split("-")[0] : "",
    qr_url: ticketUrl(origin, workOrder.id),
  };
}

// "just now", "40 s ago", "5 min ago", "3 h ago", or a date. For the printer
// status line in Configure Event.
export function formatLastSeen(iso, now = Date.now()) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs} s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

// Matches the 30-second window queue_cloudprnt_jobs() allows.
export const PRINTER_ONLINE_WINDOW_MS = 30 * 1000;

export function isPrinterOnline(lastPollAt, now = Date.now()) {
  return Boolean(lastPollAt) && now - new Date(lastPollAt).getTime() <= PRINTER_ONLINE_WINDOW_MS;
}
