# Fotos reales para probar la detección

Esta carpeta necesita 8 fotos JPEG sacadas con el celular. Mientras no estén,
`real-photos.test.ts` queda dormido (skip) y no rompe nada.

## 1. Sacar las ocho fotos

Guardarlas acá con estos nombres exactos:

| Archivo | Qué fotografiar |
|---|---|
| `01-fondo-oscuro.jpg` | Hoja blanca sobre escritorio oscuro, de frente |
| `02-fondo-claro.jpg` | Hoja blanca sobre mesa clara (bajo contraste) |
| `03-sombra-mano.jpg` | Documento con la sombra de tu propia mano encima |
| `04-angulo.jpg` | Documento en ángulo pronunciado |
| `05-sellos.jpg` | Documento con sellos o firmas de color |
| `06-ticket.jpg` | Un ticket angosto y largo |
| `07-arrugado.jpg` | Papel arrugado o doblado |
| `08-sin-documento.jpg` | Una escena cualquiera sin ningún documento (caso negativo) |

## 2. Anotar las esquinas esperadas

Copiar `expected.json.template` a `expected.json` (este último es el que
activa el test, por eso el template no lo hace):

```bash
cp expected.json.template expected.json
```

Abrir cada foto en un visor que muestre coordenadas de píxel (por ejemplo
Preview en Mac, o cualquier editor de imágenes) y anotar las cuatro esquinas
del documento, en píxeles, en este orden: `tl, tr, br, bl` (arriba-izq,
arriba-der, abajo-der, abajo-izq).

Reemplazar los ceros en `expected.json` por esas coordenadas. Para
`08-sin-documento.jpg` dejar `"corners": null` tal cual está — es el caso
donde no tiene que detectar nada.

## 3. Correr el test

```bash
pnpm test lib/scanner/__tests__/real-photos.test.ts
```

Necesita acertar al menos 6 de las 8 fotos para pasar. Si falla, el output
lista qué fotos fallaron y por qué (no detectó nada / esquinas fuera de
tolerancia / encontró un documento donde no hay).

Si da menos de 6, no tocar las fotos ni las coordenadas: ajustar los
umbrales de `../../detect.ts` (Canny 50/150, epsilon 0,02, área mínima 0,15)
contra estas fotos reales, y volver a correr el test.

## Sobre las esquinas esperadas de las fotos 03 y 04

En esas dos el papel se sale del cuadro, así que las esquinas reales del
documento no existen en la imagen. La detección devuelve el rectángulo
envolvente, que contiene todo el documento a costa de incluir algo de fondo —
verificado a ojo sobre la salida enderezada: no falta texto.

Las esquinas anotadas quedan fuera de los límites de la imagen (valores
negativos y mayores al ancho) a propósito. Sirven como test de regresión: si
un cambio futuro vuelve a recortar hacia adentro del documento, el test falla.
