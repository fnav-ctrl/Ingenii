# Renders de Viso de Campo

La web (`/visodecampo.html`) busca los renders en esta carpeta con estos nombres.
Si un archivo falta, el visor muestra una tarjeta "Render en preparación" en esa parada.

## Exteriores (`ext-XX.webp`)
| Archivo | Parada del recorrido | Descripción del render |
|---|---|---|
| ext-01 | Acceso y estacionamiento | Cocheras con auto gris, esquina del bloque |
| ext-02 | Fachada de los bloques | Fachada en perspectiva con autos estacionados |
| ext-03 | Paseo central peatonal | Pasillo entre bloques, con gente caminando |
| ext-04 | (no se usa) | Igual a ext-03 sin gente |
| ext-05 | Pileta climatizada | Pileta con el SUM vidriado al fondo |
| ext-06 | Parque y solárium | Parque con árboles, reposeras y pileta |
| ext-07 | Ingreso privado · **hero** | Vista aérea del portón con techo verde |
| ext-08 | Desde la calle | Frente del complejo desde la vereda, con reja |
| ext-09 | El predio desde arriba | Vista aérea con la cochera central y los bloques |

## SUM (`sum-XX.webp`) — ya cargados
| Archivo | Parada |
|---|---|
| sum-01 | SUM · Comedor |
| sum-02 | SUM · Cocina y estar |
| sum-03 | SUM · Gym con vista a la pileta |

## Interiores de la unidad (`int-XX.webp`)
| Archivo | Parada | Descripción del render |
|---|---|---|
| int-01 | Toilette de cortesía | Toilette angosto con bacha y espejo |
| int-02 | Baño en suite | Vanitory ancho de madera, espejo retroiluminado |
| int-03 | Baño completo | Inodoro, bidet y box de ducha |
| int-04 | Dormitorio en suite | Cama, vestidor iluminado y TV |
| int-05 | Patio con parrilla | Patio de planta baja con mesa y parrilla |
| int-06 | Ingreso · Cocina y comedor | Puerta de entrada, cocina con barra y mesa |
| int-07 | Cocina equipada | Detalle de cocina con lavarropas |
| int-08 | Estar comedor al atardecer | Estar con salida al patio, cielo naranja |

Formato recomendado: WebP, 1920 px de ancho, calidad 80. Para agregar o
reordenar paradas, editar el objeto `TOURS` al inicio del `<script>` de la web.
