import { NextRequest } from "next/server";

// Endpoint que envía el aviso por email a la responsable del programa
// (canje de beneficio, carga de foto o inscripción a sorteo).
// Requiere la variable de entorno RESEND_API_KEY. Opcionales:
//   NOTIFY_EMAIL  -> destinatario (por defecto hola@freeloagencia.com)
//   NOTIFY_FROM   -> remitente   (por defecto onboarding@resend.dev de Resend)

export const runtime = "nodejs";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let data: Record<string, any> = {};
  try {
    data = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const kind = String(data.kind || "actividad");
  const member = esc(data.memberName || "Miembro");
  const memberEmail = String(data.memberEmail || "");
  const item = esc(data.itemName || "");
  const tier = esc(data.tier || "");
  const detail = esc(data.detail || "");

  const subjects: Record<string, string> = {
    alta: `Nueva solicitud de alta — ${member}`,
    canje: `Solicitud de canje — ${member}`,
    foto: `Nueva foto de obra — ${member}`,
    video: `Nuevo video de obra — ${member}`,
    sorteo: `Inscripción a sorteo — ${member}`,
  };
  const subject = subjects[kind] || `Actividad en Piazza en Obra — ${member}`;

  const intro: Record<string, string> = {
    alta: "Un arquitecto solicitó el alta al programa. Requiere validación del equipo.",
    canje: "Un miembro solicitó un canje / beneficio.",
    foto: "Un miembro cargó una nueva foto de obra (para validar).",
    video: "Un miembro cargó un nuevo video de obra (para validar).",
    sorteo: "Un miembro se inscribió a un sorteo.",
  };

  const rows: [string, string][] = [
    ["Miembro", member],
    ["Email", esc(memberEmail) || "—"],
    ["Nivel", tier || "—"],
    ["Acción", esc(kind)],
  ];
  if (item) rows.push(["Detalle", item]);
  if (detail) rows.push(["Nota", detail]);
  // Campos extra del cuestionario de alta (label/value)
  if (Array.isArray(data.extra)) {
    for (const pair of data.extra) {
      if (Array.isArray(pair) && pair[1]) rows.push([esc(pair[0]), esc(pair[1])]);
    }
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;max-width:540px;margin:0 auto">
    <div style="background:#303030;color:#fff;padding:22px 26px">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em">Piazza <span style="font-size:11px;letter-spacing:0.06em">EN OBRA</span></div>
      <div style="font-size:12px;color:#E4D3C1;margin-top:6px;letter-spacing:0.03em">Programa de beneficios · aviso automático</div>
    </div>
    <div style="padding:26px;border:1px solid #ececec;border-top:none">
      <p style="font-size:15px;margin:0 0 18px;line-height:1.5">${esc(intro[kind] || "Se registró una nueva actividad en el programa.")}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:9px 0;color:#585858;width:110px;vertical-align:top">${k}</td><td style="padding:9px 0;font-weight:600;border-bottom:1px solid #f2f2f2">${v}</td></tr>`
          )
          .join("")}
      </table>
      <p style="font-size:12px;color:#8a8a8a;margin:22px 0 0">Enviado automáticamente desde Piazza en Obra.</p>
    </div>
  </div>`;

  // Registro en Google Sheets (best-effort; no bloquea el email).
  // Configurar SHEETS_WEBHOOK_URL con la URL del Web App de Apps Script.
  const sheetUrl = process.env.SHEETS_WEBHOOK_URL;
  if (sheetUrl && kind === "alta") {
    const map: Record<string, string> = {};
    if (Array.isArray(data.extra)) {
      for (const pair of data.extra) {
        if (Array.isArray(pair)) map[String(pair[0])] = String(pair[1] ?? "");
      }
    }
    try {
      await fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: data.memberName || "",
          email: data.memberEmail || "",
          nacimiento: map["Fecha de nacimiento"] || "",
          telefono: map["Teléfono"] || "",
          empresa: map["Empresa / estudio"] || "",
          trabajo: map["Instagram / trabajo"] || "",
          usaPiazza: map["¿Trabaja con Piazza?"] || "",
          tipoObra: map["Tipo de obras"] || "",
        }),
      });
    } catch {
      /* si falla el sheet, seguimos igual con el email */
    }
  }

  const key = process.env.RESEND_API_KEY;
  // Mientras Resend esté en modo prueba (sin dominio verificado), solo se puede
  // enviar al email de la cuenta de Resend (flor@freeloagencia.com).
  const to = process.env.NOTIFY_EMAIL || "flor@freeloagencia.com";
  const from = process.env.NOTIFY_FROM || "Piazza en Obra <onboarding@resend.dev>";

  // Sin clave configurada: respondemos OK pero avisamos que no se envió (modo no configurado).
  if (!key) {
    return json({ ok: true, sent: false, configured: false });
  }

  const attachments: { filename: string; content: string }[] = [];
  if (kind === "foto" && typeof data.image === "string" && data.image.startsWith("data:")) {
    const base64 = data.image.split(",")[1];
    if (base64 && base64.length < 4_000_000) {
      attachments.push({ filename: "foto-obra.jpg", content: base64 });
    }
  }

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        reply_to: memberEmail || undefined,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("Resend error", r.status, t);
      return json({ ok: false, sent: false, error: t.slice(0, 300) }, 502);
    }
    return json({ ok: true, sent: true });
  } catch (e: any) {
    return json({ ok: false, sent: false, error: String(e?.message || e) }, 502);
  }
}
