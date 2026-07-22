export const runtime = "nodejs";

/* =========================================================================
   API del panel de administración (/admin) de Piazza en Obra.
   Protegido por ADMIN_PASSWORD. Acciones (POST { pw, action, ... }):
     list    -> altas pendientes + cargas de fotos pendientes (con links firmados)
     member  -> aprobar/rechazar un alta (avisa al miembro)
     foto    -> aprobar N fotos (suma N*10 pts al miembro + avisa) o rechazar
   ========================================================================= */

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PW = process.env.ADMIN_PASSWORD || "";
const RKEY = process.env.RESEND_API_KEY;
const FROM = process.env.NOTIFY_FROM || "Piazza en Obra <onboarding@resend.dev>";

const PTS_POR_FOTO = 10;
const TIERS = [{ name: "Bronce", min: 0 }, { name: "Plata", min: 30 }, { name: "Oro", min: 60 }, { name: "Platinium", min: 100 }];
function tierName(pts) { let n = "Bronce"; for (const t of TIERS) if (pts >= t.min) n = t.name; return n; }

function J(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function sbGet(path) { const r = await fetch(SB + "/rest/v1/" + path, { headers: { apikey: SK, Authorization: "Bearer " + SK } }); return r.ok ? r.json() : []; }
async function sbPatch(path, body) { return fetch(SB + "/rest/v1/" + path, { method: "PATCH", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) }); }
async function signed(path) {
  try {
    const r = await fetch(SB + "/storage/v1/object/sign/obras/" + path, { method: "POST", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
    if (!r.ok) return null;
    const j = await r.json();
    return SB + "/storage/v1" + j.signedURL;
  } catch (e) { return null; }
}
async function sendEmail(to, subject, html) {
  if (!RKEY || !to) return;
  try { await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RKEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html }) }); } catch (e) {}
}
function frame(intro, rows) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;max-width:540px;margin:0 auto"><div style="background:#1A1A18;color:#fff;padding:22px 26px"><div style="font-size:20px;font-weight:800">Piazza <span style="font-size:11px">EN OBRA</span></div><div style="font-size:12px;color:#C8952A;margin-top:6px">Programa de beneficios</div></div><div style="padding:26px;border:1px solid #ececec;border-top:none"><p style="font-size:15px;margin:0 0 18px;line-height:1.5">${esc(intro)}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${rows.filter(r => r[1]).map(([k, v]) => `<tr><td style="padding:9px 0;color:#585858;width:120px">${esc(k)}</td><td style="padding:9px 0;font-weight:600;border-bottom:1px solid #f2f2f2">${esc(v)}</td></tr>`).join("")}</table></div></div>`;
}

export async function POST(req) {
  if (!SB || !SK) return J({ ok: false, error: "supabase_no_config" }, 500);
  let d = {};
  try { d = await req.json(); } catch { return J({ ok: false, error: "bad_json" }, 400); }
  if (!ADMIN_PW || String(d.pw || "") !== ADMIN_PW) return J({ ok: false, error: "auth" }, 401);
  const action = String(d.action || "");

  if (action === "list") {
    const miembros = await sbGet("miembros?estado=eq.pendiente&select=email,nombre,telefono,empresa,portfolio,usa_piazza,tipo_obra,created_at&order=created_at.desc");
    const fotosRaw = await sbGet("fotos?estado=eq.pendiente&select=*&order=created_at.desc");
    const fotos = [];
    for (const f of fotosRaw) {
      const urls = [];
      for (const p of (f.paths || [])) { const u = await signed(p); if (u) urls.push(u); }
      fotos.push({ id: f.id, miembro_email: f.miembro_email, miembro_nombre: f.miembro_nombre, nombre_carga: f.nombre_carga, descripcion: f.descripcion, cantidad: f.cantidad, created_at: f.created_at, urls });
    }
    return J({ ok: true, miembros, fotos });
  }

  if (action === "member") {
    const email = String(d.email || "").trim().toLowerCase();
    const dec = d.decision === "aprobar" ? "aprobado" : "rechazado";
    const r = await sbPatch("miembros?email=eq." + encodeURIComponent(email), { estado: dec });
    if (!r.ok) return J({ ok: false, error: "update" }, 500);
    if (dec === "aprobado") sendEmail(email, "¡Tu alta en Piazza en Obra fue aprobada!", frame("¡Bienvenido/a a la Comunidad de Arquitectos Piazza! Tu alta fue aprobada. Ya podés iniciar sesión, cargar fotos de tus obras y sumar puntos.", [["Estado", "Aprobado"]]));
    else sendEmail(email, "Tu solicitud en Piazza en Obra", frame("Gracias por tu interés. Por ahora tu solicitud no fue aprobada. Ante cualquier duda, escribinos.", [["Estado", "No aprobado"]]));
    return J({ ok: true });
  }

  if (action === "foto") {
    const id = String(d.id || "");
    const rows = await sbGet("fotos?id=eq." + encodeURIComponent(id) + "&select=*&limit=1");
    const f = rows[0];
    if (!f) return J({ ok: false, error: "no_foto" }, 404);
    if (f.estado !== "pendiente") return J({ ok: false, error: "ya_procesada" }, 409);

    if (d.decision === "aprobar") {
      let n = parseInt(d.cantidadAprobada, 10);
      if (isNaN(n) || n < 0) n = f.cantidad;
      if (n > f.cantidad) n = f.cantidad;
      const pts = n * PTS_POR_FOTO;
      await sbPatch("fotos?id=eq." + encodeURIComponent(id), { estado: "aprobada", cantidad_aprobada: n, puntos_otorgados: pts });
      const mr = await sbGet("miembros?email=eq." + encodeURIComponent(f.miembro_email) + "&select=*&limit=1");
      const m = mr[0];
      if (m && pts > 0) {
        await sbPatch("miembros?email=eq." + encodeURIComponent(f.miembro_email), { puntos_acumulados: m.puntos_acumulados + pts, puntos_disponibles: m.puntos_disponibles + pts });
        sendEmail(f.miembro_email, "¡Sumaste " + pts + " puntos en Piazza en Obra!", frame("Validamos tus fotos de obra y te acreditamos los puntos correspondientes. ¡Seguí cargando obras para subir de nivel!", [["Carga", f.nombre_carga], ["Fotos aprobadas", String(n)], ["Puntos sumados", "+" + pts]]));
      }
      return J({ ok: true });
    } else {
      await sbPatch("fotos?id=eq." + encodeURIComponent(id), { estado: "rechazada", cantidad_aprobada: 0, puntos_otorgados: 0 });
      sendEmail(f.miembro_email, "Sobre tus fotos en Piazza en Obra", frame("Revisamos tu última carga de fotos y por ahora no pudimos validarla. Podés volver a cargar fotos de tus obras cuando quieras.", [["Carga", f.nombre_carga]]));
      return J({ ok: true });
    }
  }

  return J({ ok: false, error: "accion_desconocida" }, 400);
}
