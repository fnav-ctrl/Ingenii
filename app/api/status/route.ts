import { NextRequest } from "next/server";

// Consulta el estado de una inscripción en el Google Sheet (columna "Estado")
// a través del Web App de Apps Script (doGet). Se llama del lado del servidor
// para evitar problemas de CORS desde el navegador.

export const runtime = "nodejs";

function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const email = (req.nextUrl.searchParams.get("email") || "").trim();
  const base = process.env.SHEETS_WEBHOOK_URL;
  if (!email || !base) return json({ estado: "" });

  try {
    const url = base + (base.includes("?") ? "&" : "?") + "email=" + encodeURIComponent(email);
    const r = await fetch(url, { redirect: "follow" });
    const j = await r.json().catch(() => ({}));
    return json({ estado: (j && (j as any).estado) || "" });
  } catch {
    return json({ estado: "", error: true });
  }
}
