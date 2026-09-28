# Renders de Viso de Campo

La web (`/visodecampo`) toma los renders de esta carpeta. Fuente: carpetas de Drive
"Unidades", "Sum" y "Exteriores" (set de septiembre 2026). Formato WebP, 1672 px, calidad 84.

## Exteriores
| Archivo | Origen en Drive | Uso |
|---|---|---|
| ext-ingreso | Exterior_ingreso | Portada · parada 1 del predio |
| ext-unidades | Exterior_unidades | Parada 2 (bloques y estacionamiento) · galería |
| ext-parque | Exterior_parquecentral | Parada 3 · sección Proyecto · galería |
| ext-pileta | Exterior_piletasum (= Sum_exteriorpileta) | Parada 4 · galería |

## SUM
| Archivo | Origen | Uso |
|---|---|---|
| sum-gym | Sum_interior1-1 (con personas) | Parada 5 · galería |
| sum-gym-b | Sum_interior1 (sin personas) | Alternativa, no usada |
| sum-comedor | Sum_interior2 (con personas) | Parada 6 · galería |
| sum-comedor-b | Sum_interior2-2 (sin personas) | Alternativa, no usada |

## Unidad de 3 dormitorios (`un-*`)
| Archivo | Origen | Parada |
|---|---|---|
| un-living | 4amb_living | 1 · Estar comedor |
| un-cocina | 4amb_cocina | 2 · Cocina integrada |
| un-suite | 4amb_dormppal | 3 · Suite |
| un-bano | 4amb_baño | 4 · Baño completo |
| un-dorm2 | 4amb_dorm2 | 5 · Dormitorio al jardín |

## Planos
| Archivo | Uso |
|---|---|
| plano-masterplan | Vista "Plano técnico" de la sección Predio |
| plano-masterplan-mini | Fondo del minimapa del recorrido del predio |
| plano-1a | Plano de la tipología 1A en su tarjeta |
| plano-1a-mini | Disponible (el minimapa de la unidad usa un esquema de 3 dormitorios) |

Para agregar o reordenar paradas, editar el objeto `TOURS` al inicio del `<script>` de la web.
Para sumar el plano de otra tipología: guardar `plano-1b.webp`, etc. y agregar `plan:IMG+'plano-1b.webp'` en `UNITS`.
