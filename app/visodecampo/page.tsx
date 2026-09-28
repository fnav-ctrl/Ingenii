import { redirect } from "next/navigation";

// Ruta corta de la web de Viso de Campo (archivo estático en /public).
export default function VisoDeCampo() {
  redirect("/visodecampo.html");
}
