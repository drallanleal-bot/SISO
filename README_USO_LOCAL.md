# SISO Local Empresarial Seguro

Esta version esta pensada para trabajar sin publicar datos en GitHub, Azure o internet.

## Instalar SISO como aplicacion

SISO se puede instalar como app (igual que el sistema de la clinica), con su propio icono y ventana.

1. Abre la direccion publicada de SISO en Microsoft Edge o Google Chrome.
2. En la barra de direcciones presiona el icono de instalar (monitor con flecha) o el menu `...` > `Aplicaciones` > `Instalar SISO`.
3. SISO queda en el menu Inicio y se puede anclar a la barra de tareas.
4. Dentro de la app, usa `Seleccionar carpeta SISO` para conectar la carpeta empresarial de OneDrive.

La app solo descarga el codigo. Los datos de colaboradores siguen leyendose y guardandose en la carpeta empresarial; nunca se suben a internet. Cuando se publica una mejora, la app se actualiza sola al abrirla.

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

## Donde guardar una jornada nueva

1. Guarda el CSV de la jornada dentro de `RESPALDO DE SISO/Jornadas_nuevas` (SISO crea esa carpeta la primera vez que seleccionas la carpeta SISO).
2. Abre SISO y presiona `Seleccionar carpeta SISO`.
3. SISO agrega la jornada al consolidado maestro sin duplicar registros, aunque la vuelvas a cargar.

Si hay varios Head Count en la carpeta, SISO usa el modificado mas recientemente.

Las carpetas `Vacunas/Historial` y cualquier carpeta que empiece con `Archivo_viejo` no se leen al cargar: sirven para guardar copias antiguas sin que afecten los datos.

## Respaldos sin duplicados

`Guardar respaldo legible` reemplaza los archivos por su version actual (por vacuna y año, Head Count, Fuentes, Pendientes). Solo se guarda una copia fechada del consolidado por dia en `Vacunas/Historial`, y se conservan las ultimas 5.

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
- `fecha` (opcional, por ejemplo 02/10/2026)
- `dosis` (opcional; si se deja vacia, SISO numera las dosis de Hepatitis B en orden de fecha)

Si la jornada no trae `estado`, SISO asumira `Vacunado`. Si no trae `anio`, intentara detectarlo desde el nombre del archivo.

## Consolidado final

Cada vez que cargues nuevas jornadas y ya hayas seleccionado la carpeta SISO, el sistema intentara actualizar:

- `consolidado_final_vacunaciones_siso.csv`
- `Vacunas/00_consolidado_final_vacunaciones_siso.csv`

Ese consolidado es el archivo maestro para recuperar todas las jornadas actuales y futuras. Las carpetas por año/vacuna se conservan como respaldo legible.

## Cambiar contrasenas

Las contrasenas no se guardan escritas en `app.js`; solo se guarda una huella cifrada (PBKDF2-SHA256) de la que no se puede recuperar la contrasena.

Para cambiar o agregar un usuario, pidele a Claude que genere la huella nueva y la actualice en `app.js`. Las contrasenas se comunican a cada usuario de forma personal, nunca por GitHub.
