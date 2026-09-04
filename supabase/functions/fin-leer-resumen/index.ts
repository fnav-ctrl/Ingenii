// Finanzas personales: lee un resumen de tarjeta de crédito (PDF o foto) guardado en el bucket
// privado `fin-personal` y devuelve la lista de consumos para que la dueña los revise y cargue en lote.
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
  ["alquiler", "Alquiler y servicios (alquiler, expensas, luz, gas, agua, internet, celular, seguros del hogar)"],
  ["super", "Supermercado (supermercado, almacén, verdulería, kiosco, carnicería, mayorista)"],
  ["comidas", "Comidas afuera (restaurante, bar, café, delivery como Rappi o PedidosYa, panadería)"],
  ["transporte", "Transporte (nafta, SUBE, taxi, Uber, Cabify, peaje, estacionamiento, seguro del auto)"],
  ["salud", "Salud (farmacia, médico, obra social, prepaga, dentista, óptica, veterinaria)"],
  ["ocio", "Ocio (cine, shows, viajes, hoteles, pasajes, salidas, deportes, regalos, librería)"],
  ["ropa", "Ropa (indumentaria, calzado, accesorios, perfumería)"],
  ["subs", "Suscripciones (Netflix, Spotify, Apple, Google, Amazon, software, gimnasio, apps)"],
  ["ahorro", "Ahorro (compra de dólares, inversiones)"],
  ["otros", "Otros (impuestos, intereses, comisiones, cargos de la tarjeta y todo lo que no entra en las anteriores)"],
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_resumen", "banco", "tarjeta", "cierre", "vencimiento", "total_pesos", "total_dolares", "consumos", "confianza"],
  properties: {
    es_resumen: { type: "boolean", description: "true si el archivo es un resumen o liquidación de tarjeta de crédito (o un listado de consumos de tarjeta)" },
    banco: { type: ["string", "null"], description: "banco o emisor, ej. 'Galicia', 'Santander', 'Mercado Pago'" },
    tarjeta: { type: ["string", "null"], description: "marca y últimos dígitos si se ven, ej. 'Visa 1234'" },
    cierre: { type: ["string", "null"], description: "fecha de cierre del resumen en formato YYYY-MM-DD; null si no aparece" },
    vencimiento: { type: ["string", "null"], description: "fecha de vencimiento del pago en formato YYYY-MM-DD; null si no aparece" },
    total_pesos: { type: ["number", "null"], description: "saldo total a pagar en pesos de este resumen" },
    total_dolares: { type: ["number", "null"], description: "saldo total a pagar en dólares de este resumen, null si no hay" },
    consumos: {
      type: "array",
      description: "una entrada por cada línea del detalle de movimientos, en el orden en que aparecen",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fecha", "comercio", "monto", "moneda", "cuota", "tipo", "categoria", "nota"],
        properties: {
          fecha: { type: ["string", "null"], description: "fecha de la línea en formato YYYY-MM-DD; null si no se ve" },
          comercio: { type: "string", description: "descripción tal como figura en el resumen, sin códigos internos" },
          monto: { type: "number", description: "importe de la línea tal como figura (ya es el de la cuota del mes si es en cuotas), número positivo sin separadores, redondeado a entero" },
          moneda: { type: "string", enum: ["ARS", "USD"], description: "ARS si la línea está en la columna de pesos, USD si está en la de dólares" },
          cuota: { type: ["string", "null"], description: "si es una compra en cuotas, la cuota que corresponde a este resumen, ej. '03/12'; null si no" },
          tipo: { type: "string", enum: ["consumo", "pago", "impuesto", "ajuste"], description: "consumo = compra o débito automático; pago = 'SU PAGO', pago del resumen anterior, saldo anterior; impuesto = IVA, percepciones, impuesto de sellos, ley 25413, intereses, cargos y comisiones de la tarjeta; ajuste = devoluciones, contrasientos y créditos a favor" },
          categoria: { type: "string", enum: CATEGORIAS.map((c) => c[0]) },
          nota: { type: "string", description: "nombre corto y legible del comercio para la app, 1 a 4 palabras, ej. 'Coto', 'Netflix', 'Farmacity', 'Uber'" },
        },
      },
    },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
  },
};

const SYSTEM = `Sos una asistente que lee resúmenes de tarjeta de crédito de bancos argentinos (Visa, Mastercard, American Express; Galicia, Santander, BBVA, Macro, Nación, ICBC, HSBC, Brubank, Mercado Pago, Naranja, Uala, etc.).
Tenés que devolver TODAS las líneas del detalle de consumos, sin omitir ninguna y sin inventar líneas que no estén.
Reglas:
- Una entrada por línea del detalle. Si el resumen tiene varias tarjetas (titular y adicionales) incluí todas las líneas.
- monto: número positivo, sin separadores. Los importes vienen con punto de miles y coma decimal (ej. 27.689,00). Redondeá a entero. Para compras en cuotas el importe de la línea ya es la cuota de este mes: usá ese, no el total de la compra.
- moneda: fijate en qué columna está el importe. Si la línea está en la columna de dólares (o dice USD / U$S), moneda = USD.
- cuota: si la línea dice algo como 'C.03/12', 'CUOTA 3 DE 12' o '03/12', devolvé '03/12'. Si no es en cuotas, null.
- tipo: 'pago' para 'SU PAGO', 'PAGO EN PESOS', 'SALDO ANTERIOR' y similares; 'impuesto' para IVA, percepciones (RG 4815, ganancias, bienes personales), impuesto de sellos, ley 25413, intereses de financiación, cargos, comisiones y seguros de la tarjeta; 'ajuste' para devoluciones, contrasientos y créditos; 'consumo' para todo lo demás.
- fecha: la fecha de la línea en YYYY-MM-DD. Si solo hay día y mes, deducí el año a partir de la fecha de cierre del resumen (el año actual es ${new Date().getFullYear()}). Si no hay fecha, null.
- categoria: elegí UNA por línea según el comercio:
${CATEGORIAS.map((c) => `  - ${c[0]}: ${c[1]}`).join("\n")}
  Para tipo impuesto, ajuste y pago usá 'otros'.
- nota: nombre corto y reconocible del comercio, en español, sin códigos ni números de sucursal, sin puntuación final. Ej: 'MERPAGO*COTO' -> 'Coto', 'DLO*NETFLIX' -> 'Netflix', 'PEDIDOSYA' -> 'PedidosYa'.
- Si el archivo no es un resumen de tarjeta (una selfie, un ticket suelto, un documento sin listado de consumos), es_resumen = false, consumos = [] y confianza = baja.`;

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

    // Un resumen puede tener más de cien líneas: se usa streaming para no cortar la respuesta por timeout.
    const client = new Anthropic({ apiKey });
    const res = await client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 32000,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [attachment, { type: "text", text: "Leé este resumen de tarjeta y listá todos los movimientos del detalle." }] }],
    }).finalMessage();

    if (res.stop_reason === "refusal") return json({ error: "rechazo", message: "No pude leer ese archivo." }, 422);
    if (res.stop_reason === "max_tokens") return json({ error: "largo", message: "El resumen es muy largo para leerlo de una vez. Probá subiendo una hoja por vez." }, 422);
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    let datos: Record<string, unknown>;
    try { datos = JSON.parse(text); } catch { return json({ error: "formato", message: "La lectura no devolvió datos válidos." }, 502); }
    return json({ ok: true, datos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fin-leer-resumen", msg);
    return json({ error: "fallo", message: "No pude leer el resumen: " + msg }, 500);
  }
});
