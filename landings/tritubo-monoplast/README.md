# Landing Tritubo / Monoplast

Fuente recuperada de la landing publicada en **www.tritubomonoplast.com**.

## Por que existe este archivo

La landing se publico en Vercel por *drop* (arrastrando archivos, sin repo).
El codigo fuente no estaba versionado en ningun lado: vivia unicamente dentro
del deployment. Este directorio lo rescata para que exista historial y sea
posible volver atras.

## Origen

| | |
|---|---|
| Proyecto Vercel | `monoplast-landing-tritubo2` (`prj_VtOHVYqNzAcbZz1VYIwm0Kei2IFG`) |
| Deployment | `dpl_JDP8HD3tfo1BjfEEAbC5P6ygTiZ1` |
| Recuperado el | 2026-09-03 |

## Dominios

- `www.tritubomonoplast.com` — canonica, apunta a Production
- `tritubomonoplast.com` — redirect 308 hacia `www`

## Contenido

`index.html` es un unico archivo autocontenido (~1,1 MB). No tiene
dependencias externas: la tipografia Urbanist y las 6 imagenes van embebidas
como data URIs en base64.

Secciones: hero, productos, especificaciones, aplicaciones, nosotros, cotizar.
Cubre las 4 lineas de cano PEAD: Monotubo, Bitubo, Tritubo y Cuatritubo.

## Pendiente

Este repo NO esta conectado al proyecto de Vercel. El deploy sigue siendo
manual por drop: editar este archivo no actualiza el sitio en vivo.
