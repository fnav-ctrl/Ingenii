# finanzas-flor (Vercel)

Archivos que se publican en el proyecto Vercel `finanzas-flor` (https://finanzas-flor.vercel.app).

`index.html` es una página cargadora: trae `public/finanzas.html` desde GitHub
(rama `claude/personal-finance-app-epee5z`) y la muestra. Así, cada cambio que se
sube al repo llega a la app en unos minutos sin republicar en Vercel. Si la rama
cambia de nombre o se mergea, hay que actualizar la URL en `index.html` y
volver a publicar esta carpeta.
