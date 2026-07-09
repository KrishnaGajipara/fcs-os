// FCS OS · Order status (public, no auth)
// Powers the shipment tracking page and the "update status" links in the
// warehouse notification email.
//
//   recent                   -> latest material orders for employee lookup
//   get { ref }              -> public status + timeline for one order
//   set { ref, token, status } -> update status; token must be the order's
//                                 manage token = HMAC(ORDER_TOKEN_SECRET, ref)
//
// Reading is open by reference (low-sensitivity, internal). Only the warehouse
// email holds a valid manage token, so only it can change status here. The
// office changes status through the authenticated admin-api instead.

import { createClient } from "npm:@supabase/supabase-js@2";

const ORDER_STATUSES = ["pending", "processing", "shipped", "cancelled"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const enc = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Exported shape used by the notification email to build manage links.
export async function manageToken(ref: string): Promise<string> {
  return hmacHex(Deno.env.get("ORDER_TOKEN_SECRET")!, ref);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function loadOrder(ref: string) {
  const { data: order } = await admin
    .from("material_orders")
    .select("id, reference, job_number, site_contact, site_contact_phone, requested_by, needed_by, notes, items, status, status_updated_at, created_at")
    .eq("reference", ref)
    .single();
  if (!order) return null;
  const { data: events } = await admin
    .from("material_order_events")
    .select("status, source, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  return { order, events: events ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("ORDER_TOKEN_SECRET");
  if (!secret) return json({ error: "server not configured" }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const action = String(payload.action ?? "");

  if (action === "recent") {
    const { data, error } = await admin
      .from("material_orders")
      .select("reference, job_number, site_contact, site_contact_phone, requested_by, needed_by, notes, items, status, status_updated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(75);
    if (error) return json({ error: "query failed" }, 500);
    return json({ orders: data ?? [] });
  }

  const ref = String(payload.ref ?? "");
  if (!ref) return json({ error: "missing reference" }, 400);

  if (action === "get") {
    const loaded = await loadOrder(ref);
    if (!loaded) return json({ error: "not found" }, 404);
    return json(loaded);
  }

  if (action === "set") {
    const status = String(payload.status ?? "");
    if (!ORDER_STATUSES.includes(status)) return json({ error: "invalid status" }, 400);
    const expected = await hmacHex(secret, ref);
    if (!timingSafeEqual(String(payload.token ?? ""), expected)) {
      return json({ error: "This management link is not valid." }, 401);
    }
    const { data: order } = await admin
      .from("material_orders")
      .select("id")
      .eq("reference", ref)
      .single();
    if (!order) return json({ error: "not found" }, 404);

    const now = new Date().toISOString();
    await admin.from("material_orders").update({ status, status_updated_at: now }).eq("id", order.id);
    await admin.from("material_order_events").insert({
      order_id: order.id, status, source: "warehouse",
    });

    const loaded = await loadOrder(ref);
    return json(loaded);
  }

  return json({ error: `unknown action ${action}` }, 400);
});
