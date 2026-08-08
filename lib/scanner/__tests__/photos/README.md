# Fotos reales para probar la deteccion

Esta carpeta necesita 8 fotos JPEG sacadas con el celular. Mientras no esten,
`real-photos.test.ts` queda dormido (skip) y no rompe nada.

## 1. Sacar las ocho fotos

Guardarlas aca con estos nombres exactos:

| Archivo | Que fotografiar |
|---|---|
| `01-fondo-oscuro.jpg` | Hoja blanca sobre escritorio oscuro, de frente |
| `02-fondo-claro.jpg` | Hoja blanca sobre mesa clara (bajo contraste) |
| `03-sombra-mano.jpg` | Documento con la sombra de tu propia mano encima |
| `04-angulo.jpg` | Documento en angulo pronunciado |
| `05-sellos.jpg` | Documento con sellos o firmas de color |
| `06-ticket.jpg` | Un ticket angosto y largo |
| `07-arrugado.jpg` | Papel arrugado o doblado |
| `08-sin-documento.jpg` | Una escena cualquiera sin ningun documento (caso negativo) |

## 2. Anotar las esquinas esperadas

Copiar `expected.json.template` a `expected.json` (este ultimo es el que
activa el test, por eso el template no lo hace):

```bash
cp expected.json.template expected.json
```

Abrir cada foto en un visor que muestre coordenadas de pixel (por ejemplo
Preview en Mac, o cualquier editor de imagenes) y anotar las cuatro esquinas
del documento, en pixeles, en este orden: `tl, tr, br, bl` (arriba-izq,
arriba-der, abajo-der, abajo-izq).

Reemplazar los ceros en `expected.json` por esas coordenadas. Para
`08-sin-documento.jpg` dejar `"corners": null` tal cual esta — es el caso
donde no tiene que detectar nada.

## 3. Correr el test

```bash
pnpm test lib/scanner/__tests__/real-photos.test.ts
```

Necesita acertar al menos 6 de las 8 fotos para pasar. Si falla, el output
lista que fotos fallaron y por que (no detecto nada / esquinas fuera de
tolerancia / encontro un documento donde no hay).

Si da menos de 6, no tocar las fotos ni las coordenadas: ajustar los
umbrales de `../../detect.ts` (Canny 50/150, epsilon 0,02, area minima 0,15)
contra estas fotos reales, y volver a correr el test.
