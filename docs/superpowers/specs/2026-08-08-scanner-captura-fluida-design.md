# Captura fluida en el scanner

**Fecha:** 08/08/2026
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Dos cambios de flujo en `scan-modal.tsx`. No toca el pipeline de imagen ni el worker.

---

## 1. Problema

El scanner nuevo funciona y la detección de esquinas acierta sobre hojas reales. Pero el flujo pide dos toques que no aportan nada.

**Toque de más 1 — la confirmación es obligatoria aunque la detección haya acertado.** Después de sacar la foto, el usuario siempre cae en la pantalla de ajuste de esquinas y tiene que tocar "Continuar", incluso cuando el recuadro ya está perfectamente pegado al papel.

Esto viene de una premisa equivocada del spec anterior (`2026-08-08-scanner-rewrite-design.md`, sección 3), que afirmaba que "hasta CamScanner ajusta acá". No es cierto: CamScanner recorta solo y muestra el resultado; solo se toca para ajustar cuando se equivocó.

**Toque de más 2 — pasar de una página a la siguiente cuesta dos toques.** "Usar esta página" devuelve a la pantalla de captura, donde hay que tocar "Agregar otra página". El multipágina ya funciona, pero el ritmo de escanear varias hojas seguidas se corta en cada una.

---

## 2. Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Confirmación de esquinas | Solo cuando la detección falla | Si acertó, no hay nada que corregir. Si falló, no hay resultado que mostrar. |
| Umbral de confianza extra | No | `detectCorners` ya rechaza cuadriláteros implausibles (mínimo 15% del área, convexidad). Un segundo umbral sobre uno que ya existe es complejidad sin ganancia. |
| Corrección posterior | Botón "Ajustar esquinas" en el resultado | La red de seguridad se mueve, no desaparece. |
| Ritmo multipágina | Botón "Guardar y tomar otra" | Un toque por página en vez de dos. |
| Apertura automática de la cámara | Con verificación en navegador real y degradación | Los navegadores exigen activación reciente del usuario para abrir un selector de archivos. |

---

## 3. Flujo

La máquina de estados no cambia de forma; cambia qué transiciones se toman.

**Hoy:** `idle → detecting → adjusting → warping → previewing → idle`

**Nuevo:**

```
Detección OK (caso normal)
  idle → detecting → warping → previewing → idle
                     └─ se saltea `adjusting`

Detección devuelve null (papel raro, poco contraste)
  idle → detecting → adjusting → warping → previewing → idle
                     └─ igual que hoy, con el aviso "No encontré los bordes"

Corrección desde el resultado
  previewing → adjusting → warping → previewing
               └─ las esquinas arrancan donde las detectó, no en un rectángulo genérico
```

### Pantalla de resultado (`previewing`)

Tres acciones, ordenadas por frecuencia de uso:

1. **Guardar y tomar otra** (principal) — guarda la página y abre la cámara.
2. **Guardar** — guarda y vuelve a `idle`, donde están la tira de páginas y "Crear PDF".
3. **Ajustar esquinas** (secundario, arriba) — vuelve a `adjusting` con las esquinas detectadas.

El selector de los tres modos de mejora se mantiene donde está.

---

## 4. Componentes afectados

Solo `components/editor/scanner/scan-modal.tsx`.

**El enderezado pasa a tener dos disparadores** — automático después de una detección exitosa, y manual desde "Continuar" en `adjusting`. Hoy esa lógica vive dentro de `confirmCorners`. Debe extraerse a una función compartida que ambos caminos invoquen, no duplicarse: es el bloque que decodifica la foto capeada, llama a `ScannerClient.warp`, convierte el resultado a blob y crea la URL de vista previa, con su `try/catch` y su `result?.close()` en `finally`.

**`capture` se sigue guardando siempre**, incluso cuando se saltea `adjusting`. Lo necesitan tanto "Ajustar esquinas" (para volver con las esquinas detectadas) como "Guardar la foto sin enderezar" (que guarda el `File` original).

**El enderezado automático usa el modo actual**, que arranca en Documento y conserva lo que el usuario haya elegido en la página anterior de la misma sesión. Quien escanea diez hojas en blanco y negro no vuelve a Documento en cada una.

**"Ajustar esquinas" libera el enderezado cacheado en el worker** antes de volver a `adjusting`, igual que hace hoy `backToCorners`. Si no, el worker retiene una imagen a resolución completa que ya no sirve.

No se tocan: `corner-editor.tsx`, `mode-toggle.tsx`, `scan-page-strip.tsx`, el worker, el cliente ni ninguna de las funciones puras de `lib/scanner/`.

---

## 5. Manejo de errores

El principio no cambia: ninguna falla deja al usuario sin acción posible.

| Situación | Comportamiento |
|---|---|
| La detección devuelve `null` | Va a `adjusting` con las esquinas por defecto y el aviso "No encontré los bordes. Ajustalos vos". Igual que hoy. |
| OpenCV no está disponible | La detección tira, se marca `degraded`, va a `adjusting` y aparece "Guardar la foto sin enderezar". Igual que hoy. |
| El enderezado automático falla | Cae a `adjusting` con un toast, en vez de a `idle`. El usuario puede corregir las esquinas y reintentar, o descartar. |
| **El navegador bloquea la apertura automática de la cámara** | La página ya quedó guardada. Se termina en `idle`, donde el botón "Agregar otra página" está a mano. En el peor caso se vuelve a los dos toques de hoy — nunca se pierde la página ni se queda trabado. |

---

## 6. El riesgo de la apertura automática

Los navegadores solo permiten abrir un selector de archivos si la acción proviene de una activación reciente del usuario. "Guardar y tomar otra" mete una operación asíncrona entre el toque y la apertura, lo que puede consumir esa activación — sobre todo en Safari de iOS, que es más estricto que Chrome.

En teoría la activación sobrevive porque el guardado no espera nada real (es actualización de estado más creación de un object URL, que se resuelve en microtareas). Pero eso es teoría, y la lección de la reescritura anterior es que un build en verde no prueba nada sobre el comportamiento en el navegador.

**Por lo tanto esto no se da por implementado hasta verificarlo en un navegador real**, y la degradación de la tabla anterior es parte del diseño, no un parche posterior.

---

## 7. Pruebas

El cambio es de flujo de UI en un único archivo, y el proyecto no tiene entorno de test de componentes. Las 29 pruebas existentes del pipeline de imagen deben seguir pasando sin modificación — si alguna cambia, algo se tocó que no correspondía.

La verificación es en navegador real, sobre `pnpm build` + `pnpm start`, empujando una foto sintética por el input de archivo:

1. Con una foto donde la detección acierta: se llega a la vista previa **sin pasar** por la pantalla de ajuste.
2. Con una foto sin documento: se llega a la pantalla de ajuste, con el aviso.
3. Desde la vista previa, "Ajustar esquinas" abre el editor con las esquinas detectadas, no con un rectángulo genérico.
4. "Guardar y tomar otra" guarda la página y **abre efectivamente el selector de archivos** — hay que confirmarlo observando el evento, no suponerlo.
5. Dos páginas seguidas por el camino rápido terminan en un PDF de dos páginas.

El punto 4 es el que decide si el atajo se implementa como está diseñado o si hay que replantearlo.

---

## 8. Fuera de alcance

- Detección de bordes en vivo con recuadro y autocaptura.
- Reordenar o editar páginas dentro de la tira del scanner.
- Confirmación antes de descartar páginas al cerrar el modal (decisión de producto todavía abierta).
- Cualquier cambio al pipeline de imagen, al worker o a los modos de mejora.

---

## 9. Criterio de éxito

En un celular real, escanear tres hojas seguidas cuesta tres toques de "Guardar y tomar otra" más los de la cámara nativa — ninguna pantalla de confirmación intermedia — y el papel raro que hoy no se detecta sigue llevando a la pantalla de ajuste manual en vez de a un recorte sin sentido.
