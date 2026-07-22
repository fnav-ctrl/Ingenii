import { redirect } from "next/navigation";

// La raíz del sitio redirige a la demo del programa (archivo estático en /public).
export default function Home() {
  redirect("/club.html");
}
