// FCS OS · Submission notification function
// Triggered by database webhooks on INSERT into material_orders, timesheets,
// and qc_reports. Formats a branded email and sends it through the configured
// email provider.
//
// Secrets (supabase secrets set):
//   WEBHOOK_SECRET   shared secret checked against the x-fcs-webhook-secret header
//   EMAIL_PROVIDER   "resend" (default) — add providers in PROVIDERS below
//   RESEND_API_KEY   Resend API key
//   FROM_EMAIL       sender, e.g. "FCS OS <onboarding@resend.dev>"
//   NOTIFY_EMAIL     comma-separated recipient list for notifications

import { createClient } from "npm:@supabase/supabase-js@2";

type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
};

type SendResult = { ok: true; id?: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Email providers. To switch providers later: implement a sender here, set
// EMAIL_PROVIDER and the provider's API key secret. Nothing else changes.
// ---------------------------------------------------------------------------
const PROVIDERS: Record<string, (msg: EmailMessage) => Promise<SendResult>> = {
  resend: async (msg) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("FROM_EMAIL") ?? "FCS OS <onboarding@resend.dev>",
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) return { ok: false, error: `resend ${res.status}: ${await res.text()}` };
    const body = await res.json();
    return { ok: true, id: body.id };
  },
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    timeZone: "America/New_York",
  });
};

const fmtTime = (t: string | null): string => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
};

const row = (label: string, value: string, mono = false) => `
  <tr>
    <td style="padding:9px 14px;border-bottom:1px solid #e4e7ec;color:#5f6b7a;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:9px 14px;border-bottom:1px solid #e4e7ec;color:#1a2433;font-size:14px;font-weight:600;${mono ? "font-family:ui-monospace,Menlo,monospace;" : ""}">${value}</td>
  </tr>`;

const LIST_LABELS: Record<string, string> = {
  lead: "Lead Job",
  painting: "Painting",
  custom: "Custom / Misc",
};

function shell(kind: string, reference: string, inner: string): string {
  return `
  <div style="margin:0;padding:24px 12px;background:#eef1f4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
      <tr><td style="background:#141d2b;border-radius:8px 8px 0 0;padding:18px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.4px;">FCS <span style="color:#c8643c;">OS</span>
            <div style="color:#8d99ab;font-size:11px;font-weight:600;letter-spacing:1.6px;margin-top:3px;">FINE CONSTRUCTION SPECIALTIES</div></td>
          <td align="right" style="color:#c8643c;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${kind}</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #dfe3e8;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
        ${inner}
        <p style="margin:22px 0 0;color:#8b94a1;font-size:12px;border-top:1px solid #e4e7ec;padding-top:14px;">
          Submitted through FCS Operating System · Ref ${esc(reference)} · This notification was generated automatically.
        </p>
      </td></tr>
    </table>
  </div>`;
}

// deno-lint-ignore no-explicit-any
function materialOrderEmail(r: any): { subject: string; html: string } {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(r.items) ? r.items : [];
  const itemRows = items.map((it, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #edf0f3;color:#8b94a1;font-size:12px;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #edf0f3;color:#1a2433;font-size:14px;font-weight:600;">${esc(it.name)}${it.note ? `<div style="color:#5f6b7a;font-size:12px;font-weight:400;margin-top:2px;">${esc(it.note)}</div>` : ""}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #edf0f3;color:#5f6b7a;font-size:13px;">${esc(LIST_LABELS[it.list] ?? it.list)}</td>
      <td align="right" style="padding:8px 12px;border-bottom:1px solid #edf0f3;color:#1a2433;font-size:14px;font-weight:700;font-family:ui-monospace,Menlo,monospace;">${esc(it.quantity)}</td>
    </tr>`).join("");

  const inner = `
    <h1 style="margin:0 0 4px;color:#1a2433;font-size:20px;">Material Order ${esc(r.reference)}</h1>
    <p style="margin:0 0 18px;color:#5f6b7a;font-size:14px;">New material order — please prepare shipment.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ec;border-radius:6px;border-collapse:separate;overflow:hidden;margin-bottom:20px;">
      ${row("Job #", esc(r.job_number), true)}
      ${row("Site contact", esc(r.site_contact) + (r.site_contact_phone ? ` · ${esc(r.site_contact_phone)}` : ""))}
      ${row("Requested by", esc(r.requested_by))}
      ${row("Needed by (ship-out)", `<span style="color:#b03a2e;">${fmtDate(r.needed_by)}</span>`)}
      ${r.notes ? row("Notes", esc(r.notes)) : ""}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ec;border-radius:6px;border-collapse:separate;overflow:hidden;">
      <tr style="background:#f6f7f9;">
        <th align="left" style="padding:9px 12px;color:#5f6b7a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">#</th>
        <th align="left" style="padding:9px 12px;color:#5f6b7a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Item</th>
        <th align="left" style="padding:9px 12px;color:#5f6b7a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">List</th>
        <th align="right" style="padding:9px 12px;color:#5f6b7a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Qty</th>
      </tr>
      ${itemRows}
    </table>`;

  return {
    subject: `[FCS OS] Material Order ${r.reference} — Job #${r.job_number} — needed ${fmtDate(r.needed_by)}`,
    html: shell("Material Order", r.reference, inner),
  };
}

// deno-lint-ignore no-explicit-any
function timesheetEmail(r: any): { subject: string; html: string } {
  const inner = `
    <h1 style="margin:0 0 4px;color:#1a2433;font-size:20px;">Timesheet ${esc(r.reference)}</h1>
    <p style="margin:0 0 18px;color:#5f6b7a;font-size:14px;">New timesheet submission.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ec;border-radius:6px;border-collapse:separate;overflow:hidden;">
      ${row("Employee", esc(r.employee_name))}
      ${row("Job #", esc(r.job_number), true)}
      ${row("Date", fmtDate(r.work_date))}
      ${row("Time in / out", `${fmtTime(r.time_in)} — ${fmtTime(r.time_out)}`)}
      ${row("Break", `${r.break_minutes ?? 0} min`)}
      ${row("Total hours", `<span style="font-size:16px;">${esc(r.total_hours)}</span>`)}
      ${r.work_performed ? row("Work performed", esc(r.work_performed)) : ""}
      ${r.notes ? row("Notes", esc(r.notes)) : ""}
    </table>`;
  return {
    subject: `[FCS OS] Timesheet ${r.reference} — ${r.employee_name} — Job #${r.job_number} — ${fmtDate(r.work_date)}`,
    html: shell("Timesheet", r.reference, inner),
  };
}

const RESULT_LABELS: Record<string, [string, string]> = {
  pass: ["PASS", "#1e7e34"],
  pass_with_notes: ["PASS WITH NOTES", "#b8860b"],
  fail: ["FAIL", "#b03a2e"],
};

// deno-lint-ignore no-explicit-any
async function qcReportEmail(r: any): Promise<{ subject: string; html: string }> {
  const [label, color] = RESULT_LABELS[r.result] ?? [String(r.result).toUpperCase(), "#5f6b7a"];

  let photoBlock = "";
  const photos: string[] = Array.isArray(r.photos) ? r.photos : [];
  if (photos.length > 0) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const links: string[] = [];
    for (const [i, path] of photos.entries()) {
      const { data } = await admin.storage.from("qc-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
      if (data?.signedUrl) {
        links.push(`<a href="${data.signedUrl}" style="color:#c8643c;font-weight:600;">Photo ${i + 1}</a>`);
      }
    }
    if (links.length > 0) {
      photoBlock = row("Photos (links valid 30 days)", links.join(" &nbsp;·&nbsp; "));
    }
  }

  const inner = `
    <h1 style="margin:0 0 4px;color:#1a2433;font-size:20px;">QC Report ${esc(r.reference)}
      <span style="display:inline-block;margin-left:6px;padding:3px 10px;border-radius:4px;background:${color};color:#fff;font-size:11px;letter-spacing:1px;vertical-align:middle;">${label}</span>
    </h1>
    <p style="margin:0 0 18px;color:#5f6b7a;font-size:14px;">New quality control report.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ec;border-radius:6px;border-collapse:separate;overflow:hidden;">
      ${row("Job #", esc(r.job_number), true)}
      ${row("Date", fmtDate(r.report_date))}
      ${row("Inspector", esc(r.inspector_name))}
      ${row("Area inspected", esc(r.area_inspected))}
      ${row("Work inspected", esc(r.work_inspected))}
      ${r.observations ? row("Observations", esc(r.observations)) : ""}
      ${r.deficiencies ? row("Deficiencies", esc(r.deficiencies)) : ""}
      ${r.corrective_actions ? row("Corrective actions", esc(r.corrective_actions)) : ""}
      ${photoBlock}
      ${r.notes ? row("Notes", esc(r.notes)) : ""}
    </table>`;
  return {
    subject: `[FCS OS] QC Report ${r.reference} — Job #${r.job_number} — ${label}`,
    html: shell("QC Report", r.reference, inner),
  };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-fcs-webhook-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json();
  const table: string = payload.table;
  const record = payload.record;
  if (!table || !record) {
    return new Response("bad payload", { status: 400 });
  }

  let msg: { subject: string; html: string };
  switch (table) {
    case "material_orders":
      msg = materialOrderEmail(record);
      break;
    case "timesheets":
      msg = timesheetEmail(record);
      break;
    case "qc_reports":
      msg = await qcReportEmail(record);
      break;
    default:
      return new Response(`unknown table ${table}`, { status: 400 });
  }

  const providerName = Deno.env.get("EMAIL_PROVIDER") ?? "resend";
  const send = PROVIDERS[providerName];
  if (!send) {
    return new Response(`unknown provider ${providerName}`, { status: 500 });
  }

  const to = (Deno.env.get("NOTIFY_EMAIL") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    return new Response("NOTIFY_EMAIL not configured", { status: 500 });
  }

  const result = await send({ to, ...msg });
  if (!result.ok) {
    console.error("send failed:", result.error);
    return new Response(JSON.stringify(result), { status: 502 });
  }
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
