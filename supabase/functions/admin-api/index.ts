// FCS OS · Admin API
// Password-authenticated backend for the admin dashboard. Runs with the
// service role, so it can read submissions (which anon cannot) and manage them.
//
// Auth model: single shared password (public.admin_settings, salted SHA-256).
// On login the function issues a short-lived HMAC session token; every other
// action requires a valid token. No cookies — the token is sent in the body.
//
// Secrets:
//   ADMIN_TOKEN_SECRET   HMAC key for session tokens (set via supabase secrets)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   auto-injected

import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
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

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

function randomSaltHex(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

// Constant-time string compare (equal length hex strings).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

async function issueToken(secret: string): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await hmacHex(secret, String(exp));
  return `${exp}.${sig}`;
}

async function verifyToken(secret: string, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(secret, expStr);
  return timingSafeEqual(sig, expected);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyPassword(password: string): Promise<boolean> {
  const { data, error } = await admin
    .from("admin_settings")
    .select("password_salt, password_hash")
    .eq("id", 1)
    .single();
  if (error || !data) return false;
  const calc = await sha256Hex(data.password_salt + password);
  return timingSafeEqual(calc, data.password_hash);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("ADMIN_TOKEN_SECRET");
  if (!secret) return json({ error: "server not configured" }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const action = String(payload.action ?? "");

  // ---- login (no token required) ----
  if (action === "login") {
    const password = String(payload.password ?? "");
    if (!password || !(await verifyPassword(password))) {
      // Small delay to blunt brute forcing.
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: "Incorrect password." }, 401);
    }
    return json({ token: await issueToken(secret), expiresIn: TOKEN_TTL_MS });
  }

  // ---- everything else requires a valid token ----
  if (!(await verifyToken(secret, payload.token))) {
    return json({ error: "unauthorized" }, 401);
  }

  switch (action) {
    case "data": {
      const [orders, timesheets, qc] = await Promise.all([
        admin.from("material_orders").select("*").order("created_at", { ascending: false }).limit(2000),
        admin.from("timesheets").select("*").order("created_at", { ascending: false }).limit(2000),
        admin.from("qc_reports").select("*").order("created_at", { ascending: false }).limit(2000),
      ]);
      if (orders.error || timesheets.error || qc.error) {
        return json({ error: "query failed" }, 500);
      }
      return json({
        material_orders: orders.data,
        timesheets: timesheets.data,
        qc_reports: qc.data,
      });
    }

    case "update_order_status": {
      const id = String(payload.id ?? "");
      const status = String(payload.status ?? "");
      if (!id || !ORDER_STATUSES.includes(status)) {
        return json({ error: "invalid id or status" }, 400);
      }
      const { data, error } = await admin
        .from("material_orders")
        .update({ status, status_updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) return json({ error: "update failed" }, 500);
      await admin.from("material_order_events").insert({ order_id: id, status, source: "office" });
      return json({ order: data });
    }

    case "signed_photo": {
      const path = String(payload.path ?? "");
      if (!path) return json({ error: "missing path" }, 400);
      const { data, error } = await admin.storage
        .from("qc-photos")
        .createSignedUrl(path, 60 * 60);
      if (error || !data) return json({ error: "sign failed" }, 500);
      return json({ url: data.signedUrl });
    }

    // ---- material categories ----
    case "categories": {
      const { data, error } = await admin
        .from("material_categories")
        .select("*")
        .order("sort_order");
      if (error) return json({ error: "query failed" }, 500);
      return json({ categories: data });
    }

    case "create_category": {
      const name = String(payload.name ?? "").trim();
      if (!name) return json({ error: "Category name is required." }, 400);
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      if (!slug) return json({ error: "Could not derive a slug from that name." }, 400);
      const { data: maxRow } = await admin
        .from("material_categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = (maxRow?.sort_order ?? 0) + 1;
      const { data, error } = await admin
        .from("material_categories")
        .insert({ slug, name, sort_order })
        .select()
        .single();
      if (error) {
        const msg = error.code === "23505" ? "A category with that name already exists." : "Could not create category.";
        return json({ error: msg }, 400);
      }
      return json({ category: data });
    }

    case "update_category": {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "missing id" }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof payload.name === "string" && payload.name.trim()) patch.name = payload.name.trim();
      if (typeof payload.active === "boolean") patch.active = payload.active;
      if (typeof payload.sort_order === "number") patch.sort_order = payload.sort_order;
      if (Object.keys(patch).length === 0) return json({ error: "nothing to update" }, 400);
      const { data, error } = await admin
        .from("material_categories")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return json({ error: "update failed" }, 500);
      return json({ category: data });
    }

    case "delete_category": {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "missing id" }, 400);
      const { data: cat } = await admin.from("material_categories").select("slug").eq("id", id).single();
      if (!cat) return json({ error: "not found" }, 404);
      const { count } = await admin
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("list", cat.slug);
      if (count && count > 0) {
        return json({ error: `This category still has ${count} material(s). Remove or move them first.` }, 400);
      }
      const { error } = await admin.from("material_categories").delete().eq("id", id);
      if (error) return json({ error: "delete failed" }, 500);
      return json({ ok: true });
    }

    // ---- materials ----
    case "materials_all": {
      const { data, error } = await admin
        .from("materials")
        .select("*")
        .order("list")
        .order("grp")
        .order("sort_order");
      if (error) return json({ error: "query failed" }, 500);
      return json({ materials: data });
    }

    case "create_material": {
      const list = String(payload.list ?? "").trim();
      const name = String(payload.name ?? "").trim();
      const grp = String(payload.grp ?? "Materials").trim() || "Materials";
      const detail = payload.detail ? String(payload.detail).trim() : null;
      if (!list || !name) return json({ error: "Category and name are required." }, 400);
      const { data: maxRow } = await admin
        .from("materials")
        .select("sort_order")
        .eq("list", list)
        .eq("grp", grp)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = (maxRow?.sort_order ?? 0) + 1;
      const { data, error } = await admin
        .from("materials")
        .insert({ list, grp, name, detail, sort_order })
        .select()
        .single();
      if (error) {
        const msg = error.code === "23505" ? "That item already exists in this category/section." : "Could not create material.";
        return json({ error: msg }, 400);
      }
      return json({ material: data });
    }

    case "update_material": {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "missing id" }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof payload.name === "string" && payload.name.trim()) patch.name = payload.name.trim();
      if (typeof payload.detail === "string") patch.detail = payload.detail.trim() || null;
      if (typeof payload.grp === "string" && payload.grp.trim()) patch.grp = payload.grp.trim();
      if (typeof payload.list === "string" && payload.list.trim()) patch.list = payload.list.trim();
      if (typeof payload.active === "boolean") patch.active = payload.active;
      if (typeof payload.sort_order === "number") patch.sort_order = payload.sort_order;
      if (Object.keys(patch).length === 0) return json({ error: "nothing to update" }, 400);
      const { data, error } = await admin
        .from("materials")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return json({ error: "update failed" }, 500);
      return json({ material: data });
    }

    case "delete_material": {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "missing id" }, 400);
      const { error } = await admin.from("materials").delete().eq("id", id);
      if (error) return json({ error: "delete failed" }, 500);
      return json({ ok: true });
    }

    case "change_password": {
      const current = String(payload.currentPassword ?? "");
      const next = String(payload.newPassword ?? "");
      if (!(await verifyPassword(current))) {
        return json({ error: "Current password is incorrect." }, 401);
      }
      if (next.length < 8) {
        return json({ error: "New password must be at least 8 characters." }, 400);
      }
      const salt = randomSaltHex();
      const hash = await sha256Hex(salt + next);
      const { error } = await admin
        .from("admin_settings")
        .update({ password_salt: salt, password_hash: hash, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return json({ error: "update failed" }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: `unknown action ${action}` }, 400);
  }
});
