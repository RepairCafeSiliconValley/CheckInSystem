// claim-and-notify — public Edge Function (verify_jwt = false)
//
// A fixer scans the ticket's "claim" QR and taps "Start work & call client over".
// This function:
//   1. Marks the work order 'assigned' (With Fixer) and records the fixer name.
//   2. Best-effort texts the client via Twilio to come to the repair area,
//      only if a phone is on file and no 'summon' SMS was already sent.
//
// The phone number never leaves the server: it's read here with the service-role
// key and used only to call Twilio. The response never includes it.
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164, +1…)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// US phone → E.164. Accepts 10 digits (matches the check-in ^\d{10}$ validation)
// or a leading-1 11-digit form. Returns null when it isn't a usable US number.
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let workOrderId: string | undefined;
  let fixerName: string | undefined;
  try {
    const body = await req.json();
    workOrderId = body.work_order_id;
    fixerName = (body.fixer_name ?? "").trim();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!workOrderId) return json({ error: "work_order_id is required" }, 400);
  if (!fixerName) return json({ error: "fixer_name is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ─── Look up the work order + its client (service role bypasses RLS) ───
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select(
      "id, status, event_id, attendee_id, item_name, attendees ( first_name, phone )",
    )
    .eq("id", workOrderId)
    .maybeSingle();

  if (woErr) return json({ error: "Lookup failed" }, 500);
  if (!wo) return json({ error: "Work order not found" }, 404);
  if (wo.status === "completed" || wo.status === "canceled") {
    return json({ error: `Work order is already ${wo.status}` }, 409);
  }

  // ─── 1. Claim: move to With Fixer + record the fixer (always) ───
  const { error: updErr } = await supabase
    .from("work_orders")
    .update({
      status: "assigned",
      fixer_name: fixerName,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (updErr) return json({ error: "Could not claim work order" }, 500);

  const attendee = Array.isArray(wo.attendees) ? wo.attendees[0] : wo.attendees;
  const firstName: string = attendee?.first_name ?? "there";
  const to = toE164(attendee?.phone);

  const done = (texted: boolean, reason: string) =>
    json({ ok: true, status: "assigned", texted, reason });

  // ─── 2. Text the client (best-effort, gated) ───
  if (!to) return done(false, "no_phone");

  // Once-only: a prior non-failed 'summon' row blocks a second send.
  const { data: prior } = await supabase
    .from("sms_notifications")
    .select("id")
    .eq("work_order_id", workOrderId)
    .eq("message_type", "summon")
    .neq("status", "failed")
    .limit(1);
  if (prior && prior.length > 0) return done(false, "already_sent");

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) return done(false, "sms_not_configured");

  // DEV escape hatch: Twilio trial accounts reject custom bodies (error 572006)
  // and accept only predefined template keys, e.g. "sms_appointment_reminders".
  // Setting TWILIO_DEMO_BODY sends that key instead of the real summons, so the
  // whole flow can be smoke-tested before the account is upgraded. The text the
  // client receives is then Twilio's canned demo copy, not ours — so leave this
  // secret UNSET in production.
  const demoBody = Deno.env.get("TWILIO_DEMO_BODY");
  const messageBody = demoBody ||
    `Hi ${firstName}, a fixer at the Repair Cafe is ready to look at your ` +
    `${wo.item_name}. Please come to the repair area. Thanks!`;

  const logBase = {
    work_order_id: workOrderId,
    attendee_id: wo.attendee_id,
    event_id: wo.event_id,
    to_phone: to,
    message_type: "summon",
    body: messageBody,
  };

  try {
    const form = new URLSearchParams({ To: to, From: from, Body: messageBody });
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    const result = await resp.json();

    if (!resp.ok) {
      await supabase.from("sms_notifications").insert({
        ...logBase,
        status: "failed",
        error: result?.message ?? `Twilio HTTP ${resp.status}`,
      });
      return done(false, "send_failed");
    }

    await supabase.from("sms_notifications").insert({
      ...logBase,
      twilio_sid: result?.sid ?? null,
      status: result?.status ?? "queued",
    });
    return done(true, "sent");
  } catch (e) {
    await supabase.from("sms_notifications").insert({
      ...logBase,
      status: "failed",
      error: String(e),
    });
    return done(false, "send_failed");
  }
});
