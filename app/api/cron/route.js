export const runtime = "nodejs";

/* =========================================================================
   Resumen mensual automático de Piazza en Obra.
   Vercel Cron llama GET /api/cron el 1° de cada mes (ver vercel.json) con
   el header Authorization: Bearer <CRON_SECRET>. Recorre los miembros
   aprobados y les manda un mail con su resumen de puntos + invitación a
   subir fotos.
   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
        NOTIFY_FROM, NOTIFY_PLATFORM_URL, CRON_SECRET
   ========================================================================= */

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RKEY = process.env.RESEND_API_KEY;
const FROM = process.env.NOTIFY_FROM || "Piazza en Obra <onboarding@resend.dev>";
const PLATFORM = process.env.NOTIFY_PLATFORM_URL || "https://piazza-en-obra.vercel.app";
const SECRET = process.env.CRON_SECRET || "";

const TIERS = [{ name: "Bronce", min: 0 }, { name: "Plata", min: 100 }, { name: "Oro", min: 200 }, { name: "Platinium", min: 300 }];
function tierName(pts) { let n = "Bronce"; for (const t of TIERS) if (pts >= t.min) n = t.name; return n; }
function nextTier(pts) { for (const t of TIERS) if (pts < t.min) return t; return null; }

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function sbGet(path) { const r = await fetch(SB + "/rest/v1/" + path, { headers: { apikey: SK, Authorization: "Bearer " + SK } }); return r.ok ? r.json() : []; }
async function sendEmail(to, subject, html) {
  if (!RKEY || !to) return false;
  try { const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RKEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html }) }); return r.ok; } catch (e) { return false; }
}
function frame(intro, rows, cta) {
  const btn = cta && cta.url
    ? `<div style="margin-top:22px"><a href="${esc(cta.url)}" style="display:inline-block;background:#C8952A;color:#1A1A18;text-decoration:none;font-weight:800;font-size:14px;padding:14px 28px;letter-spacing:0.02em">${esc(cta.label || "Ir a la plataforma")}</a></div>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;max-width:540px;margin:0 auto"><div style="background:#1A1A18;color:#fff;padding:22px 26px"><div style="font-size:20px;font-weight:800">Piazza <span style="font-size:11px">EN OBRA</span></div><div style="font-size:12px;color:#C8952A;margin-top:6px">Tu resumen mensual</div></div><div style="padding:26px;border:1px solid #ececec;border-top:none"><p style="font-size:15px;margin:0 0 18px;line-height:1.5">${esc(intro)}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${rows.filter(r => r[1]).map(([k, v]) => `<tr><td style="padding:9px 0;color:#585858;width:160px">${esc(k)}</td><td style="padding:9px 0;font-weight:600;border-bottom:1px solid #f2f2f2">${esc(v)}</td></tr>`).join("")}</table>${btn}<p style="font-size:12px;color:#888;margin-top:20px;line-height:1.5">📸 ¡Subí tus fotos y etiquetá @griferiapiazza para que podamos compartir tu perfil en nuestras redes!</p></div></div>`;
}

async function run() {
  const miembros = await sbGet("miembros?estado=eq.aprobado&select=email,nombre,puntos_disponibles,puntos_acumulados");
  let sent = 0;
  for (const m of miembros) {
    const acumulado = m.puntos_acumulados || 0;
    const nt = nextTier(acumulado);
    const faltan = nt ? "Te faltan " + (nt.min - acumulado) + " pts para " + nt.name : "Estás en el nivel máximo";
    const nombre = (m.nombre || "").split(/\s+/)[0] || "";
    const html = frame(
      "¡Hola" + (nombre ? " " + nombre : "") + "! Este es tu resumen mensual en Piazza en Obra. Seguí cargando fotos de tus obras con productos Piazza para sumar puntos, subir de nivel y canjear beneficios.",
      [["Puntos disponibles", (m.puntos_disponibles || 0) + " pts"], ["Puntos acumulados", acumulado + " pts"], ["Tu nivel", tierName(acumulado)], ["Próximo nivel", faltan]],
      { label: "Cargar fotos de obra", url: PLATFORM }
    );
    if (await sendEmail(m.email, "Tu resumen mensual · Piazza en Obra", html)) sent++;
  }
  return { total: miembros.length, sent };
}

export async function GET(req) {
  if (!SB || !SK) return new Response(JSON.stringify({ ok: false, error: "supabase_no_config" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const auth = req.headers.get("authorization") || "";
  if (!SECRET || auth !== "Bearer " + SECRET) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const res = await run();
  return new Response(JSON.stringify({ ok: true, ...res }), { status: 200, headers: { "Content-Type": "application/json" } });
}
