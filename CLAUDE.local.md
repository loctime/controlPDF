# Memoria del proyecto — controlPDF

## Scanner compartido con controldoc-holding (2026-08-17)

**`lib/scanner/` (motor OpenCV.js: `stylize.ts`, `detect.ts`, `cv.ts`, etc.) está duplicado en [[project_controldoc_holding]] (`frontend/src/scanner/`), NO importado como paquete.** El código se portó a mano de acá para allá el 09/08. Cualquier cambio que se haga en el pipeline de procesamiento de imagen acá (`normalizeIllumination`, `denoiseAndLiftWhites`, `boostContrast`, `detect.ts`, etc.) hay que **replicarlo a mano en controldoc-holding** — o al menos evaluar si aplica y anotarlo si se decide no portarlo todavía. No hay ningún mecanismo automático que los mantenga sincronizados.

Ya pasó una vez: el filtro de blanqueo de fondo (`denoiseAndLiftWhites`, commits `ab314b8`/`150b75f`) se agregó acá el 15/08 y quedó una semana sin portar a controldoc-holding hasta que Diego preguntó explícitamente — portado el 17/08.

**Al tocar `lib/scanner/stylize.ts` (o el resto de `lib/scanner/`), revisar si el cambio aplica también a `controldoc-holding/frontend/src/scanner/` y portarlo en la misma sesión si tiene sentido.**
