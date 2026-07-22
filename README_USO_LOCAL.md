# SISO Local Empresarial Seguro

Esta version esta pensada para trabajar sin publicar datos en GitHub, Azure o internet.

## Como abrir

1. Abre `Abrir_SISO.bat`.
2. Entra con tu usuario autorizado.
3. Carga el Head Count mensual desde CSV.
4. Carga las jornadas de vacunacion desde CSV.
5. Guarda respaldos legibles en la carpeta empresarial de OneDrive/SharePoint.

Si aparece "No se puede acceder a este sitio" en `127.0.0.1:4190`, usa `Abrir_SISO_DIRECTO.bat` o abre `index.html` con doble clic.

## Cargar desde carpeta SISO

Usa el boton `Seleccionar carpeta SISO` y elige la carpeta empresarial:

`C:\Users\OCUPAC01\OneDrive - Heineken International\CLINICA IAK HNK - General\RESPALDO DE SISO`

SISO revisara los CSV dentro de la carpeta y subcarpetas. Si detecta Head Count, actualiza la poblacion activa. Si detecta jornadas, las agrega al modulo de vacunaciones.

Si existe `consolidado_final_vacunaciones_siso.csv`, SISO usara ese archivo como maestro de jornadas y evitara cargar de nuevo los CSV separados. Esto evita duplicados y hace que en el futuro solo debas seleccionar la carpeta SISO.

## Convertir Excel a CSV

Para convertir archivos `.xlsx` o `.xls` sin subir datos a internet:

1. Abre `Convertir_Excel_a_CSV.bat`.
2. Selecciona uno o varios archivos Excel.
3. El convertidor creara una carpeta `CSV_CONVERTIDOS` junto a los Excel.
4. Sube esos CSV a SISO o guardalos dentro de la carpeta empresarial.

Nota: el boton `Convertir Excel a CSV` dentro de SISO recuerda este proceso. La conversion real se hace con el archivo local `.bat` porque el navegador no puede leer Excel completo de forma confiable sin librerias externas.

## Carpeta empresarial recomendada

`C:\Users\OCUPAC01\OneDrive - Heineken International\CLINICA IAK HNK - General\RESPALDO DE SISO`

Dentro de esa carpeta el sistema puede crear respaldos legibles por modulo:

- `Vacunas`
- `Head_Count`
- `Fuentes`
- `Pendientes_de_validar`
- futuros modulos como `FENIX` o `Programas`

## Regla importante

No subir a GitHub ni compartir publicamente:

- Head Count real
- listados de vacunacion
- resultados FENIX
- archivos Excel/CSV/PDF con colaboradores
- `data.json` o `data.local.json` reales
- carpetas de respaldos

## Archivos seguros para version de codigo

Estos archivos si pueden conservarse como estructura del sistema:

- `index.html`
- `app.js`
- `styles.css`
- `assets`
- `data.sample.json`
- `.gitignore`
- `README_USO_LOCAL.md`
- `Convertir_Excel_a_CSV.bat`
- `convertir_excel_a_csv.ps1`

## Datos iniciales

La app arranca vacia para no incluir datos reales. `data.sample.json` solo documenta la estructura esperada con informacion ficticia.

## Formato para jornadas de vacunacion

Usa el boton `Plantilla CSV` en Jornadas de vacunacion. Las columnas esperadas son:

- `codigo`
- `nombre`
- `vacuna`
- `anio`
- `estado`
- `gerencia`
- `tipo`
- `fuente`

Si la jornada no trae `estado`, SISO asumira `Vacunado`. Si no trae `anio`, intentara detectarlo desde el nombre del archivo.

## Consolidado final

Cada vez que cargues nuevas jornadas y ya hayas seleccionado la carpeta SISO, el sistema intentara actualizar:

- `consolidado_final_vacunaciones_siso.csv`
- `Vacunas/00_consolidado_final_vacunaciones_siso.csv`

Ese consolidado es el archivo maestro para recuperar todas las jornadas actuales y futuras. Las carpetas por año/vacuna se conservan como respaldo legible.
