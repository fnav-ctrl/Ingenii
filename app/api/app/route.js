export const runtime = "nodejs";
import { createHash, randomUUID } from "crypto";

/* =========================================================================
   API principal de Piazza en Obra (sobre Supabase).
   Acciones (POST { action, ... }):
     register  -> crea el miembro (estado pendiente) + avisa a Flor
     login     -> valida credenciales, devuelve sesión + estado + puntos
     me        -> estado/puntos/nivel + fotos del miembro
     canje     -> descuenta puntos disponibles + registra canje + avisa
     fotos     -> sube fotos al Storage privado (quedan pendientes de validar)
   Requiere env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
   Email opcional: RESEND_API_KEY, NOTIFY_EMAIL, NOTIFY_FROM.
   ========================================================================= */

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RKEY = process.env.RESEND_API_KEY;
const NOTIFY = process.env.NOTIFY_EMAIL || "flor@freeloagencia.com";
const FROM = process.env.NOTIFY_FROM || "Piazza en Obra <onboarding@resend.dev>";

const PTS_POR_FOTO = 10;
const TIERS = [
  { name: "Bronce", min: 0 }, { name: "Plata", min: 30 },
  { name: "Oro", min: 60 }, { name: "Platinium", min: 100 },
];
function tierName(pts) { let n = "Bronce"; for (const t of TIERS) if (pts >= t.min) n = t.name; return n; }

function J(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
function hash(email, pass) { return createHash("sha256").update(String(email).toLowerCase() + ":" + String(pass)).digest("hex"); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function sbGet(path) {
  const r = await fetch(SB + "/rest/v1/" + path, { headers: { apikey: SK, Authorization: "Bearer " + SK } });
  if (!r.ok) return [];
  return r.json();
}
async function sbPost(path, body, prefer) {
  return fetch(SB + "/rest/v1/" + path, { method: "POST", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", Prefer: prefer || "return=representation" }, body: JSON.stringify(body) });
}
async function sbPatch(path, body) {
  return fetch(SB + "/rest/v1/" + path, { method: "PATCH", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
}
async function getMember(email) {
  const rows = await sbGet("miembros?email=eq." + encodeURIComponent(email.toLowerCase()) + "&select=*&limit=1");
  return rows[0] || null;
}
function pub(m) {
  return { email: m.email, nombre: m.nombre, estado: m.estado, puntos: m.puntos_disponibles, acumulado: m.puntos_acumulados, tier: tierName(m.puntos_acumulados) };
}
function frame(intro, rows) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;max-width:540px;margin:0 auto"><div style="background:#1A1A18;color:#fff;padding:22px 26px"><div style="font-size:20px;font-weight:800">Piazza <span style="font-size:11px">EN OBRA</span></div><div style="font-size:12px;color:#C8952A;margin-top:6px">Programa de beneficios · aviso automático</div></div><div style="padding:26px;border:1px solid #ececec;border-top:none"><p style="font-size:15px;margin:0 0 18px;line-height:1.5">${esc(intro)}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${rows.filter(r => r[1]).map(([k, v]) => `<tr><td style="padding:9px 0;color:#585858;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;font-weight:600;border-bottom:1px solid #f2f2f2">${esc(v)}</td></tr>`).join("")}</table></div></div>`;
}
async function sendEmail(to, subject, html) {
  if (!RKEY) return;
  try { await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RKEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html }) }); } catch (e) {}
}
async function uploadImage(objectPath, dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const buf = Buffer.from(base64, "base64");
  const r = await fetch(SB + "/storage/v1/object/obras/" + objectPath, {
    method: "POST",
    headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: buf,
  });
  return r.ok;
}

export async function POST(req) {
  if (!SB || !SK) return J({ ok: false, error: "supabase_no_config" }, 500);
  let d = {};
  try { d = await req.json(); } catch { return J({ ok: false, error: "bad_json" }, 400); }
  const action = String(d.action || "");

  if (action === "register") {
    const email = String(d.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") < 1) return J({ ok: false, error: "email" }, 400);
    if (!d.password || String(d.password).length < 4) return J({ ok: false, error: "pass" }, 400);
    if (await getMember(email)) return J({ ok: false, error: "exists" }, 409);
    const body = { email, nombre: d.name || "", pass_hash: hash(email, d.password), telefono: d.phone || "", nacimiento: d.birth || "", empresa: d.company || "", portfolio: d.portfolio || "", usa_piazza: d.usesPiazza || "", tipo_obra: d.obraType || "", estado: "pendiente" };
    const r = await sbPost("miembros", body);
    if (!r.ok) { const t = await r.text(); return J({ ok: false, error: t.slice(0, 200) }, 500); }
    sendEmail(NOTIFY, "Nueva solicitud de alta — " + (d.name || email), frame("Un arquitecto solicitó el alta al programa. Aprobála o rechazala desde el panel /admin.", [["Nombre", d.name], ["Email", email], ["Teléfono", d.phone], ["Empresa", d.company], ["Instagram/Trabajo", d.portfolio], ["¿Usa Piazza?", d.usesPiazza], ["Tipo de obra", d.obraType]]));
    return J({ ok: true, estado: "pendiente" });
  }

  if (action === "login") {
    const email = String(d.email || "").trim().toLowerCase();
    const m = await getMember(email);
    if (!m || m.pass_hash !== hash(email, d.password)) return J({ ok: false, error: "cred" }, 401);
    return J({ ok: true, session: m.pass_hash, member: pub(m) });
  }

  // --- acciones autenticadas (email + session=pass_hash) ---
  const email = String(d.email || "").trim().toLowerCase();
  const m = await getMember(email);
  if (!m || d.session !== m.pass_hash) return J({ ok: false, error: "auth" }, 401);

  if (action === "me") {
    const fotos = await sbGet("fotos?miembro_email=eq." + encodeURIComponent(email) + "&select=id,nombre_carga,descripcion,cantidad,estado,cantidad_aprobada,puntos_otorgados,created_at&order=created_at.desc&limit=30");
    return J({ ok: true, member: pub(m), fotos });
  }

  if (action === "canje") {
    if (m.estado !== "aprobado") return J({ ok: false, error: "no_aprobado" }, 403);
    const costo = parseInt(d.costo, 10) || 0;
    if (m.puntos_disponibles < costo) return J({ ok: false, error: "insuficiente" }, 400);
    await sbPatch("miembros?email=eq." + encodeURIComponent(email), { puntos_disponibles: m.puntos_disponibles - costo });
    await sbPost("canjes", { miembro_email: email, producto: d.producto || "", costo }, "return=minimal");
    sendEmail(NOTIFY, "Solicitud de canje — " + (m.nombre || email), frame("Un miembro solicitó un canje de producto.", [["Miembro", m.nombre], ["Email", email], ["Producto", d.producto], ["Costo", costo + " pts"], ["Nivel", tierName(m.puntos_acumulados)]]));
    const m2 = await getMember(email);
    return J({ ok: true, member: pub(m2) });
  }

  if (action === "fotos") {
    if (m.estado !== "aprobado") return J({ ok: false, error: "no_aprobado" }, 403);
    const imgs = Array.isArray(d.images) ? d.images.filter((x) => typeof x === "string" && x.startsWith("data:")).slice(0, 10) : [];
    if (!imgs.length) return J({ ok: false, error: "no_images" }, 400);
    const subId = randomUUID();
    const paths = [];
    for (let i = 0; i < imgs.length; i++) {
      const p = email + "/" + subId + "/" + (i + 1) + ".jpg";
      const ok = await uploadImage(p, imgs[i]);
      if (ok) paths.push(p);
    }
    if (!paths.length) return J({ ok: false, error: "upload_fail" }, 500);
    await sbPost("fotos", { miembro_email: email, miembro_nombre: m.nombre || "", nombre_carga: d.nombreCarga || "", descripcion: d.descripcion || "", cantidad: paths.length, paths, estado: "pendiente" }, "return=minimal");
    sendEmail(NOTIFY, "Nuevas fotos de obra — " + (m.nombre || email), frame("Un miembro cargó fotos de obra. Revisalas y aprobá la cantidad desde el panel /admin.", [["Miembro", m.nombre], ["Email", email], ["Carga", d.nombreCarga], ["Descripción", d.descripcion], ["Cantidad", String(paths.length)]]));
    return J({ ok: true });
  }

  return J({ ok: false, error: "accion_desconocida" }, 400);
}
