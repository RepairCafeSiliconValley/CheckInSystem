import { supabase } from "./supabase";

// ─── Events ───

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchEventById(id) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function fetchOpenEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_open", true)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createEvent({
  name,
  date,
  location,
  maxItems = 2,
  collectEmail = true,
  collectPhone = true,
  collectWeight = false,
}) {
  const { data, error } = await supabase
    .from("events")
    .insert({
      name,
      date,
      location,
      max_items: maxItems,
      collect_email: collectEmail,
      collect_phone: collectPhone,
      collect_weight: collectWeight,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Generic event writer — takes a column patch so new per-event settings don't
// each need their own function.
export async function updateEvent(id, patch) {
  const { error } = await supabase.from("events").update(patch).eq("id", id);
  if (error) throw error;
}

export async function toggleEventOpen(id, isOpen) {
  await updateEvent(id, { is_open: isOpen });
}

// ─── Check-in (atomic via RPC) ───

export async function checkinVisitor(eventId, firstName, lastName, email, phone, zipCode, items, waiverVersion, waiverText, waiverHash, newsletterOptIn) {
  const rpcItems = items.map((item, idx) => ({
    item_name: item.name.trim(),
    description: item.description.trim(),
    priority: idx + 1,
  }));

  const { data, error } = await supabase.rpc("checkin_visitor", {
    p_event_id: eventId,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_email: email?.trim() || null,
    p_items: rpcItems,
    p_phone: phone?.trim() || null,
    p_zip_code: zipCode.trim(),
    p_waiver_version: waiverVersion || null,
    p_waiver_text: waiverText || null,
    p_waiver_hash: waiverHash || null,
    p_newsletter_opt_in: !!newsletterOptIn,
  });

  if (error) throw error;
  return data;
}

// ─── Visitor Groups (for coordinator queue) ───

export async function fetchVisitorGroups(eventId) {
  const [attendeesRes, ordersRes] = await Promise.all([
    supabase.from("attendees").select("*").eq("event_id", eventId),
    supabase
      .from("work_orders")
      .select("*")
      .eq("event_id", eventId)
      .order("priority", { ascending: true }),
  ]);

  if (attendeesRes.error) throw attendeesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  const attendees = attendeesRes.data;
  const orders = ordersRes.data;

  // Group by attendee
  const grouped = {};
  orders.forEach((wo) => {
    if (!grouped[wo.attendee_id]) {
      const att = attendees.find((a) => a.id === wo.attendee_id);
      grouped[wo.attendee_id] = { attendee: att, orders: [] };
    }
    grouped[wo.attendee_id].orders.push(wo);
  });

  return Object.values(grouped)
    .map((g) => ({
      ...g,
      latestCreatedAt: Math.max(
        ...g.orders.map((o) => new Date(o.created_at).getTime())
      ),
    }))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

// ─── Single visitor data ───

export async function fetchVisitorDetail(attendeeId) {
  const [attRes, ordersRes] = await Promise.all([
    supabase.from("attendees").select("*").eq("id", attendeeId).single(),
    supabase
      .from("work_orders")
      .select("*")
      .eq("attendee_id", attendeeId)
      .order("priority", { ascending: true }),
  ]);

  if (attRes.error) throw attRes.error;
  if (ordersRes.error) throw ordersRes.error;

  // The event carries the collect_* settings that decide which fields the
  // visitor detail screen renders. Sequential — event_id comes off the attendee.
  const event = await fetchEventById(attRes.data.event_id);

  return { attendee: attRes.data, orders: ordersRes.data, event };
}

// ─── Work order by ID (public fixer page) ───

export async function fetchWorkOrderById(id) {
  const { data } = await supabase
    .rpc("get_fixer_work_order", { p_id: id })
    .maybeSingle();
  return data; // null when not found; client_name is pre-abbreviated server-side
}

// ─── Fixer outcome (public, via RPC) ───

export async function submitFixerOutcome(workOrderId, fixerName, outcome, notFixedReason = null) {
  const { error } = await supabase.rpc("submit_fixer_outcome", {
    p_work_order_id: workOrderId,
    p_fixer_name: fixerName.trim(),
    p_outcome: outcome,
    p_not_fixed_reason: notFixedReason || null,
  });
  if (error) throw error;
}

// ─── Updates ───

export async function updateAttendee(id, updates) {
  const { error } = await supabase
    .from("attendees")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function updateWorkOrder(id, updates) {
  const { error } = await supabase
    .from("work_orders")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

// ─── Stats ───

// Raw rows for the metrics tab, aggregated client-side by src/lib/metrics.js.
// eventIds: an array of event ids to scope to, or null for every event.
// Deliberately selects no PII (no names, email or phone) — nothing on the
// metrics screens needs it, and this keeps a whole-database read cheap.
export async function fetchMetricsRows(eventIds = null) {
  if (Array.isArray(eventIds) && eventIds.length === 0) {
    return { attendees: [], orders: [] };
  }

  let attendeesQ = supabase
    .from("attendees")
    .select("id, event_id, is_volunteer, newsletter_opt_in, zip_code, created_at");
  let ordersQ = supabase
    .from("work_orders")
    .select(
      "id, event_id, attendee_id, status, outcome, cancel_reason, not_fixed_reason, category, fixer_name, weight_kg, created_at, printed_at, completed_at"
    );

  if (eventIds) {
    attendeesQ = attendeesQ.in("event_id", eventIds);
    ordersQ = ordersQ.in("event_id", eventIds);
  }

  const [attendeesRes, ordersRes] = await Promise.all([attendeesQ, ordersQ]);
  if (attendeesRes.error) throw attendeesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  return { attendees: attendeesRes.data || [], orders: ordersRes.data || [] };
}

// fetchEventStats was removed here: it pulled every row for one event and
// filtered in JS, and Admin called it once per event. Everything now goes
// through fetchMetricsRows + computeByEvent in a single round trip.

// ─── Export ───

export async function exportAttendeesCSV(eventId, eventName) {
  const { data, error } = await supabase
    .from("attendees")
    .select("first_name, last_name, email, phone, zip_code, is_volunteer, newsletter_opt_in, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = "First Name,Last Name,Email,Phone,Zip Code,Volunteer,Newsletter,Checked In";
  const rows = data.map((a) =>
    [
      esc(a.first_name),
      esc(a.last_name),
      esc(a.email),
      esc(a.phone),
      esc(a.zip_code),
      a.is_volunteer ? "Yes" : "No",
      a.newsletter_opt_in ? "Yes" : "No",
      new Date(a.created_at).toLocaleString(),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = eventName.replace(/[^a-zA-Z0-9]/g, "-");
  a.download = `${safeName}-attendees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Realtime ───

export function subscribeToEvent(eventId, onUpdate) {
  const channel = supabase
    .channel(`event-${eventId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "attendees",
        filter: `event_id=eq.${eventId}`,
      },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "work_orders",
        filter: `event_id=eq.${eventId}`,
      },
      () => onUpdate()
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─── Auth ───

export async function signIn(password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: "admin@repaircafe.app",
    password,
  });
  return !error;
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
}
