// cloudprnt — public Edge Function (verify_jwt = false) that Star printers
// poll. It speaks the Star CloudPRNT HTTP protocol:
//
//   POST   the printer checks in (every few seconds) with its MAC address and
//          status. We record the check-in and answer whether a job is waiting.
//   GET    the printer fetches the waiting job (?mac=…&type=…&token=…).
//   DELETE the printer reports the result (?mac=…&code=…&token=…). Printers
//          set to "GET" as their delete method send GET with &delete instead.
//
// Jobs are rows in print_jobs, queued by the desk through the
// queue_cloudprnt_jobs() RPC (supabase-cloudprnt-migration.sql). The ticket
// layout lives in ./starTicket.js.
//
// Authentication: the printer can't send a Supabase JWT, so the function
// checks a shared secret instead, in either of two places:
//   • the URL path:  …/functions/v1/cloudprnt/<CLOUDPRNT_SECRET>
//   • HTTP Basic auth, with the secret as the password (any username)
// Without CLOUDPRNT_SECRET set, every request is refused.
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   CLOUDPRNT_SECRET — a long random string, also entered in the printer.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Setup steps for the printer are in docs/cloudprnt-printing.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildStarTicket, buildTextTicket } from "./starTicket.js";

// What we can produce, best first. The printer picks the first it supports.
const MEDIA_TYPES = [
  "application/vnd.star.starprnt",
  "application/vnd.star.line",
  "text/plain",
];

// A queued job nobody fetched within this long is dropped rather than printed
// late: the desk has moved on, and the ticket would surprise everyone.
const JOB_TTL_MS = 10 * 60 * 1000;
// A job the printer fetched but never confirmed goes back in the queue after
// this long, in case it lost power mid-print.
const FETCH_TIMEOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

// Same canonical form as normalize_mac() in SQL and normalizeMac() in
// src/lib/printing.js.
function normalizeMac(raw: string | null | undefined): string | null {
  const hex = String(raw ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/../g)!.join(":");
}

function decode(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request, url: URL): boolean {
  const secret = Deno.env.get("CLOUDPRNT_SECRET");
  if (!secret) return false;
  // Path form: the last segment after /cloudprnt/.
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("cloudprnt");
  if (at >= 0 && parts[at + 1] === secret) return true;
  // Basic auth form.
  const header = req.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(header.slice(6).trim());
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (password === secret) return true;
    } catch {
      // fall through
    }
  }
  return false;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!Deno.env.get("CLOUDPRNT_SECRET")) {
    return json({ error: "CLOUDPRNT_SECRET is not configured" }, 500);
  }
  if (!authorized(req, url)) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ─── POST: the printer checks in ───
  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const mac = normalizeMac(String(body.printerMAC ?? ""));
    if (!mac) return json({ error: "printerMAC is required" }, 400);

    await supabase.from("cloudprnt_printers").upsert({
      printer_mac: mac,
      last_poll_at: new Date().toISOString(),
      status_code: decode(String(body.statusCode ?? "")) || null,
      printing_in_progress: body.printingInProgress === true,
    });

    const now = Date.now();
    // Drop jobs that waited too long, and requeue fetched-but-unconfirmed ones.
    await supabase
      .from("print_jobs")
      .update({ state: "expired", completed_at: new Date(now).toISOString() })
      .eq("printer_mac", mac)
      .eq("state", "queued")
      .lt("created_at", new Date(now - JOB_TTL_MS).toISOString());
    await supabase
      .from("print_jobs")
      .update({ fetched_at: null })
      .eq("printer_mac", mac)
      .eq("state", "queued")
      .lt("fetched_at", new Date(now - FETCH_TIMEOUT_MS).toISOString());

    // Busy printing the last one: say nothing is ready, so jobs go one at a
    // time and in order.
    if (body.printingInProgress === true) return json({ jobReady: false });

    const { data: job } = await supabase
      .from("print_jobs")
      .select("id")
      .eq("printer_mac", mac)
      .eq("state", "queued")
      .is("fetched_at", null)
      .order("seq", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!job) return json({ jobReady: false });
    return json({ jobReady: true, mediaTypes: MEDIA_TYPES, jobToken: job.id });
  }

  const mac = normalizeMac(url.searchParams.get("mac"));
  if (!mac) return json({ error: "mac is required" }, 400);
  const token = url.searchParams.get("token");
  const isDelete =
    req.method === "DELETE" ||
    (req.method === "GET" && (url.searchParams.has("delete") || url.searchParams.has("code")));

  // ─── DELETE: the printer reports how the job went ───
  if (isDelete) {
    const queued = () =>
      supabase
        .from("print_jobs")
        .select("id, attempts")
        .eq("printer_mac", mac)
        .eq("state", "queued");
    // Printers that predate job tokens confirm "the job you gave me": the
    // oldest one they fetched.
    const { data: job } = token
      ? await queued().eq("id", token).maybeSingle()
      : await queued()
        .not("fetched_at", "is", null)
        .order("seq", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (!job) return new Response(null, { status: 200 });

    const code = decode(url.searchParams.get("code")) || "200 OK";
    const ok = code.startsWith("2");
    const failedForGood = !ok && job.attempts >= MAX_ATTEMPTS;
    await supabase
      .from("print_jobs")
      .update(
        ok || failedForGood
          ? {
            state: ok ? "printed" : "failed",
            result_code: code,
            completed_at: new Date().toISOString(),
          }
          // Not printed yet: back in the queue for another try.
          : { result_code: code, fetched_at: null },
      )
      .eq("id", job.id);
    return new Response(null, { status: 200 });
  }

  // ─── GET: the printer fetches the job ───
  if (req.method === "GET") {
    const type = decode(url.searchParams.get("type")) || MEDIA_TYPES[0];
    if (!MEDIA_TYPES.includes(type)) {
      return json({ error: `Unsupported media type ${type}` }, 415);
    }

    const queued = () =>
      supabase
        .from("print_jobs")
        .select("id, ticket, reprint, attempts")
        .eq("printer_mac", mac)
        .eq("state", "queued");
    const { data: job } = token
      ? await queued().eq("id", token).maybeSingle()
      : await queued().order("seq", { ascending: true }).limit(1).maybeSingle();
    if (!job) return new Response(null, { status: 404 });

    await supabase
      .from("print_jobs")
      .update({ fetched_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq("id", job.id);

    const options = { reprint: job.reprint === true };
    const body = type === "text/plain"
      ? buildTextTicket(job.ticket, options)
      : buildStarTicket(job.ticket, options);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": type },
    });
  }

  return json({ error: "Method not allowed" }, 405);
});
