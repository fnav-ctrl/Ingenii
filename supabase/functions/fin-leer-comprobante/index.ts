// Finanzas personales: lee un comprobante (foto o PDF) guardado en el bucket privado
// `fin-personal` y devuelve los campos del gasto para precargar el formulario.
// Desplegada en el proyecto Supabase "FREELO FINANZAS". Requiere el secreto ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const OWNER_ID = "4556dc5a-4c45-45ca-aa01-306cfc62c1e5";
const BUCKET = "fin-personal";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CATEGORIAS = [
  ["alquiler", "Alquiler y servicios (alquiler, expensas, luz, gas, agua, internet, celular)"],
  ["super", "Supermercado (supermercado, almacén, verdulería, kiosco, carnicería, farmacia NO)"],
  ["comidas", "Comidas afuera (restaurante, bar, café, delivery, panadería para comer)"],
  ["transporte", "Transporte (nafta, SUBE, taxi, Uber, peaje, estacionamiento)"],
  ["salud", "Salud (farmacia, médico, obra social, prepaga, dentista)"],
  ["ocio", "Ocio (cine, shows, viajes, salidas, deportes, regalos para mí)"],
  ["ropa", "Ropa (indumentaria, calzado, accesorios)"],
  ["subs", "Suscripciones (streaming, apps, software, gimnasio)"],
  ["ahorro", "Ahorro (compra de dólares, transferencia a ahorro, inversiones)"],
  ["otros", "Otros (todo lo que no entra en las anteriores)"],
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_comprobante", "tipo", "monto", "fecha", "comercio", "categoria", "nota", "confianza"],
  properties: {
    es_comprobante: { type: "boolean", description: "true si el archivo es un ticket, factura, recibo, captura de pago o transferencia" },
    tipo: { type: "string", enum: ["gasto", "ingreso"], description: "gasto salvo que sea claramente dinero recibido" },
    monto: { type: ["number", "null"], description: "total pagado en pesos argentinos, sin separadores; null si no se ve" },
    fecha: { type: ["string", "null"], description: "fecha de la operación en formato YYYY-MM-DD; null si no se ve" },
    comercio: { type: ["string", "null"], description: "nombre corto del comercio o de quien cobró/pagó" },
    categoria: { type: "string", enum: CATEGORIAS.map((c) => c[0]) },
    nota: { type: "string", description: "resumen de 2 a 6 palabras para identificar el gasto, ej. 'Super Coto', 'Farmacia', 'Uber al centro'" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
  },
};

const SYSTEM = `Sos una asistente que lee comprobantes de gastos personales en Argentina (tickets de supermercado, facturas, recibos, capturas de Mercado Pago, transferencias bancarias, QR).
Extraé los datos de la operación y devolvelos en el formato pedido.
Reglas:
- monto: el TOTAL final que se pagó (no subtotales ni IVA). Los montos suelen estar en pesos con punto de miles y coma decimal (ej. 27.689,00). Devolvé un número sin separadores. Redondeá a entero.
- fecha: la fecha de la operación. Si solo hay día y mes, asumí el año más probable (el año actual es ${new Date().getFullYear()}). Si no aparece, null.
- categoria: elegí UNA de esta lista según el comercio o los ítems:
${CATEGORIAS.map((c) => `  - ${c[0]}: ${c[1]}`).join("\n")}
- nota: corta, en español rioplatense, sin puntuación final.
- Si el archivo no es un comprobante (una selfie, un paisaje, un documento sin importes), es_comprobante = false y confianza = baja.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user || user.id !== OWNER_ID) return json({ error: "no_autorizada", message: "Esta app es personal." }, 403);

    const { path } = await req.json().catch(() => ({}));
    if (typeof path !== "string" || !path.startsWith(user.id + "/")) return json({ error: "path", message: "Falta el archivo." }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "sin_clave", message: "Falta configurar la clave de IA (ANTHROPIC_API_KEY) en Supabase." }, 503);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(path);
    if (dlErr || !file) return json({ error: "descarga", message: "No pude leer el archivo subido." }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    const lower = path.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
    const mediaType = isPdf ? "application/pdf" : lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";

    const attachment = isPdf
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data: b64 } };

    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [attachment, { type: "text", text: "Leé este comprobante y extraé los datos de la operación." }] }],
    });

    if (res.stop_reason === "refusal") return json({ error: "rechazo", message: "No pude leer ese archivo." }, 422);
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    let datos: Record<string, unknown>;
    try { datos = JSON.parse(text); } catch { return json({ error: "formato", message: "La lectura no devolvió datos válidos." }, 502); }
    return json({ ok: true, datos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fin-leer-comprobante", msg);
    return json({ error: "fallo", message: "No pude leer el comprobante: " + msg }, 500);
  }
});
