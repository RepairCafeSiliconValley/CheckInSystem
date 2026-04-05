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

export async function createEvent(name, date, location) {
  const { data, error } = await supabase
    .from("events")
    .insert({ name, date, location })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleEventOpen(id, isOpen) {
  const { error } = await supabase
    .from("events")
    .update({ is_open: isOpen })
    .eq("id", id);
  if (error) throw error;
}

// ─── Check-in (atomic via RPC) ───

export async function checkinVisitor(eventId, name, email, phone, zipCode, items, waiverVersion, waiverText, waiverHash) {
  const rpcItems = items.map((item, idx) => ({
    item_name: item.name.trim(),
    description: item.description.trim(),
    priority: idx + 1,
  }));

  const { data, error } = await supabase.rpc("checkin_visitor", {
    p_event_id: eventId,
    p_name: name.trim(),
    p_email: email?.trim() || null,
    p_items: rpcItems,
    p_phone: phone?.trim() || null,
    p_zip_code: zipCode.trim(),
    p_waiver_version: waiverVersion || null,
    p_waiver_text: waiverText || null,
    p_waiver_hash: waiverHash || null,
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
      groupStatus: getGroupStatus(g.orders),
      latestCreatedAt: Math.max(
        ...g.orders.map((o) => new Date(o.created_at).getTime())
      ),
    }))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

function getGroupStatus(orders) {
  if (orders.some((o) => o.status === "pending")) return "pending";
  if (orders.some((o) => o.status === "assigned")) return "assigned";
  if (orders.some((o) => o.status === "pending_assignment")) return "pending_assignment";
  return "completed";
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

  return { attendee: attRes.data, orders: ordersRes.data };
}

// ─── Work order by ID (public fixer page) ───

export async function fetchWorkOrderById(id) {
  const { data } = await supabase
    .from("work_orders")
    .select("*, attendees(name)")
    .eq("id", id)
    .single();
  return data;
}

// ─── Fixer outcome (public, via RPC) ───

export async function submitFixerOutcome(workOrderId, fixerName, outcome) {
  const { error } = await supabase.rpc("submit_fixer_outcome", {
    p_work_order_id: workOrderId,
    p_fixer_name: fixerName.trim(),
    p_outcome: outcome,
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

export async function fetchEventStats(eventId) {
  const [attendeesRes, ordersRes] = await Promise.all([
    supabase
      .from("attendees")
      .select("id", { count: "exact" })
      .eq("event_id", eventId),
    supabase.from("work_orders").select("*").eq("event_id", eventId),
  ]);

  const attendeeCount = attendeesRes.count || 0;
  const orders = ordersRes.data || [];
  const fixed = orders.filter((w) => w.outcome === "Fixed").length;

  return { attendeeCount, orderCount: orders.length, fixedCount: fixed };
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
