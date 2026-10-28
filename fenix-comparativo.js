// =====================================================================
// SISO - Programa FENIX
//  1) Registro de medidas (peso, talla, grasa, presion...) por año.
//  2) Ganadores: compara laboratorios y medidas entre dos años
//     (2025 vs 2026, 2026 vs 2027, y asi sucesivamente).
// Los PDF de laboratorio son imagenes escaneadas: se leen con OCR en esta
// computadora. Ningun dato sale de la carpeta empresarial.
// =====================================================================

const CMP = {
  ocrCacheKey: "siso_fenix_ocr_v1",
  registryKey: "siso_fenix_registro_v1",
  legacyMeasuresKey: "siso_fenix_medidas_2026_v1",
  prefsKey: "siso_fenix_comparativo_anios",
  ocrFile: "laboratorios_leidos_ocr.csv",
  folder: "Comparativo",
  topLab: 15,
  topFinal: 5,
  pdfjsSources: [
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/",
  ],
  tesseractSources: [
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js",
  ],
};

// Campos de medidas. Los nombres coinciden con los CSV de antropometria / signos vitales.
const MEASURE_FIELDS = [
  { key: "peso_kg", label: "Peso (kg)", type: "decimal" },
  { key: "estatura_cm", label: "Talla (cm)", type: "decimal" },
  { key: "imc", label: "IMC", type: "auto" },
  { key: "grasa_pct", label: "% grasa", type: "decimal" },
  { key: "grasa_visceral", label: "Grasa visceral", type: "decimal" },
  { key: "masa_muscular", label: "Masa muscular", type: "decimal" },
  { key: "cintura_cm", label: "Cintura (cm)", type: "decimal" },
  { key: "presion_arterial", label: "Presión (ej. 120/80)", type: "pa" },
  { key: "frecuencia_cardiaca", label: "Frec. cardiaca", type: "decimal" },
];
const REGISTRY_COLUMNS = ["persona", "dpi", "codigo", "nombre", "fecha", ...MEASURE_FIELDS.map((f) => f.key), "registrado_por"];

// penalty: cuanto mas resta si EMPEORA (colesterol total y trigliceridos pesan doble).
const MARKERS = [
  { key: "ct", label: "Col. total", better: "down", isNormal: (v) => v < 200, penalty: 2 },
  { key: "ldl", label: "LDL", better: "down", isNormal: (v) => v < 130, penalty: 1 },
  { key: "hdl", label: "HDL", better: "up", isNormal: (v) => v >= 40, penalty: 1 },
  { key: "tg", label: "Triglic.", better: "down", isNormal: (v) => v < 150, penalty: 2 },
  { key: "glu", label: "Glucosa", better: "down", isNormal: (v) => v < 100, penalty: 1 },
];
const WEIGHT_GAIN_PENALTY = 2; // subir de peso resta el doble de lo que suma bajarlo

function loadJsonSafe(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function saveJsonSafe(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento local: se conserva en memoria y en la carpeta.
  }
}

const cmpState = {
  imported: {}, // { año: { antro: [], vitals: [] } } desde FENIX_<año>_antropometria / _signos_vitales
  registry: loadJsonSafe(CMP.registryKey, {}), // { año: { persona: entrada } }
  ocr: loadJsonSafe(CMP.ocrCacheKey, {}),
  running: false,
  stop: false,
  editingKey: null,
};

// Medidas 2026 capturadas en la version anterior -> registro 2026.
(function migrateLegacyMeasures() {
  const legacy = loadJsonSafe(CMP.legacyMeasuresKey, null);
  if (!legacy) return;
  cmpState.registry["2026"] = cmpState.registry["2026"] || {};
  Object.entries(legacy).forEach(([persona, m]) => {
    if (cmpState.registry["2026"][persona]) return;
    cmpState.registry["2026"][persona] = { persona, peso_kg: m.peso || "", grasa_pct: m.grasa || "", presion_arterial: m.pa || "" };
  });
  saveJsonSafe(CMP.registryKey, cmpState.registry);
  try {
    localStorage.removeItem(CMP.legacyMeasuresKey);
  } catch {
    // nada
  }
})();

// ---------- Lectura del texto del laboratorio ----------
function cmpNumber(text) {
  const match = String(text || "").match(/(?<![a-z0-9])(\d{1,4}(?:[.,]\d{1,3})?)(?![a-z0-9])/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

// Convierte el texto leido por OCR en valores. Tolera "LDL-COLESTEROL" o "Colesterol LDL", mayusculas, etc.
function parseLabText(text) {
  const values = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const raw of lines) {
    const line = normalizeText(raw).replace(/\s+/g, " ");
    const take = (key, pattern) => {
      if (values[key] != null) return;
      const m = line.match(pattern);
      if (!m) return;
      const value = cmpNumber(line.slice(m.index + m[0].length));
      if (value != null) values[key] = value;
    };
    if (/glicosilada|hba1c/.test(line)) take("hba1c", /(glicosilada\s*(\(hba1c\))?|\(?hba1c\)?)/);
    else if (/ldl/.test(line)) take("ldl", /(ldl[\s-]*colesterol|colesterol[\s-]*ldl|ldl)/);
    else if (/hdl/.test(line)) take("hdl", /(colesterol[\s-]*hdl|hdl[\s-]*colesterol|hdl)/);
    else if (/colesterol\s*total/.test(line)) take("ct", /colesterol\s*total/);
    else if (/triglic/.test(line)) take("tg", /triglic[a-z]*/);
    else if (/glucosa/.test(line)) take("glu", /glucosa(\s+en\s+ayunas|\s+pre\s*prandial)?/);
    if (!values.fecha) {
      const m = line.match(/toma de muestra\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) values.fecha = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (!values.dpi) {
      const m = raw.match(/\b(\d{13})\b/);
      if (m && /id|cui|dpi/i.test(raw)) values.dpi = m[1];
    }
  }
  return values;
}

function lipidCount(values) {
  return ["ct", "ldl", "hdl", "tg", "glu"].filter((k) => values && values[k] != null).length;
}

// ---------- Utilidades ----------
function toNum(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parsePA(value) {
  const m = String(value || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null;
}

function cmpRowsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeText(h));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "").trim()])));
}

function cmpCsv(columns, rows) {
  return `﻿${[columns, ...rows.map((r) => columns.map((c) => r[c] ?? ""))]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n")}`;
}

function fenixYear(record) {
  return String(record.anio || "").match(/20\d{2}/)?.[0] || "";
}

function fenixDpi(record) {
  const fromIndex = String(record.dpi || "").replace(/\D/g, "");
  if (fromIndex.length === 13) return fromIndex;
  const fromFile = String(record.archivo || record.ruta_relativa || "").match(/(?<!\d)(\d{13})(?!\d)/);
  return fromFile ? fromFile[1] : "";
}

function personKeyFor(p) {
  const dpi = String(p.dpi || "").replace(/\D/g, "");
  if (dpi.length === 13) return `d:${dpi}`;
  const code = normalizeCode(p.codigo);
  if (code) return `c:${code.replace(/^0+/, "")}`;
  return `n:${normalizeText(p.nombre)}`;
}

// Fecha de hoy en la hora de la computadora (no en hora internacional).
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYear() {
  return String(new Date().getFullYear());
}

// ---------- Años disponibles y selección ----------
function availableYears() {
  const years = new Set();
  state.fenixRecords.forEach((r) => fenixYear(r) && years.add(fenixYear(r)));
  Object.keys(cmpState.registry).forEach((y) => years.add(y));
  Object.keys(cmpState.imported).forEach((y) => years.add(y));
  return [...years].filter(Boolean).sort();
}

function selectedYears() {
  const years = availableYears();
  const saved = loadJsonSafe(CMP.prefsKey, null);
  let base = saved?.base;
  let comp = saved?.comp;
  if (!years.includes(base) || !years.includes(comp) || base >= comp) {
    comp = years[years.length - 1] || currentYear();
    base = years[years.length - 2] || String(Number(comp) - 1);
  }
  return { base, comp };
}

function renderYearSelectors() {
  const years = availableYears();
  const { base, comp } = selectedYears();
  const fill = (id, value) => {
    const select = $(id);
    if (!select) return;
    select.innerHTML = years.map((y) => `<option value="${y}" ${y === value ? "selected" : ""}>${y}</option>`).join("");
  };
  fill("cmpBaseYear", base);
  fill("cmpCompYear", comp);
  document.querySelectorAll("[data-cmp-base]").forEach((el) => (el.textContent = base));
  document.querySelectorAll("[data-cmp-comp]").forEach((el) => (el.textContent = comp));
}

// ---------- Participantes: FENIX en ambos años ----------
function cmpParticipants(base, comp) {
  const groups = [];
  state.fenixRecords.forEach((record) => {
    const year = fenixYear(record);
    if (year !== base && year !== comp) return;
    const dpi = fenixDpi(record);
    let group = groups.find((g) => (dpi && g.dpi ? g.dpi === dpi : samePerson(g, record)));
    if (!group) {
      group = { dpi, nombre: record.nombre, codigo: record.codigo, files: { [base]: [], [comp]: [] } };
      groups.push(group);
    }
    if (!group.dpi && dpi) group.dpi = dpi;
    group.files[year].push(record);
  });
  return groups
    .filter((g) => g.files[base].length && g.files[comp].length)
    .map((g) => ({ ...g, key: personKeyFor(g) }));
}

// ---------- Medidas por año: archivos importados + registro en SISO ----------
function findRow(rows, person) {
  if (!rows || !rows.length) return null;
  const dpi = String(person.dpi || "").replace(/\D/g, "");
  if (dpi) {
    const byDpi = rows.find((r) => String(r.dpi || "").replace(/\D/g, "") === dpi);
    if (byDpi) return byDpi;
  }
  // Por nombre solo si no hay DPI distinto que demuestre que son personas diferentes.
  return (
    rows.find((r) => {
      const rowDpi = String(r.dpi || "").replace(/\D/g, "");
      if (dpi && rowDpi && rowDpi !== dpi) return false;
      return samePerson({ nombre: r.nombre, codigo: r.codigo }, { nombre: person.nombre, codigo: person.codigo });
    }) || null
  );
}

function registryRows(year) {
  return Object.values(cmpState.registry[year] || {});
}

function measuresFor(person, year) {
  const imp = cmpState.imported[year] || {};
  const reg = cmpState.registry[year]?.[person.key] || findRow(registryRows(year), person);
  const out = { ...(findRow(imp.antro, person) || {}), ...(findRow(imp.vitals, person) || {}) };
  if (reg) {
    MEASURE_FIELDS.forEach((f) => {
      if (String(reg[f.key] ?? "").trim() !== "") out[f.key] = reg[f.key];
    });
  }
  return out;
}

// ---------- Carga desde la carpeta SISO ----------
window.onSisoFolderLoaded = async (csvFiles) => {
  for (const item of csvFiles) {
    const path = normalizeText(item.path);
    const year = path.match(/fenix_(20\d{2})_/)?.[1];
    if (year && path.includes("antropometria")) {
      cmpState.imported[year] = { ...(cmpState.imported[year] || {}), antro: cmpRowsFromCsv(await item.file.text()) };
    } else if (year && path.includes("signos_vitales")) {
      cmpState.imported[year] = { ...(cmpState.imported[year] || {}), vitals: cmpRowsFromCsv(await item.file.text()) };
    } else if (year && path.includes("registro_medidas")) {
      mergeRegistryCsv(year, await item.file.text());
    } else if (path.endsWith(normalizeText(CMP.ocrFile))) {
      mergeOcrCsv(await item.file.text());
    }
  }
  renderRegistry();
  renderCompare();
};

function mergeOcrCsv(text) {
  cmpRowsFromCsv(text).forEach((row) => {
    if (!row.ruta_relativa || cmpState.ocr[row.ruta_relativa]) return;
    const entry = { anio: row.anio };
    ["dpi", "fecha", "error"].forEach((k) => row[k] && (entry[k] = row[k]));
    ["ct", "ldl", "hdl", "tg", "glu", "hba1c"].forEach((k) => toNum(row[k]) != null && (entry[k] = toNum(row[k])));
    cmpState.ocr[row.ruta_relativa] = entry;
  });
  saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
}

function mergeRegistryCsv(year, text) {
  cmpState.registry[year] = cmpState.registry[year] || {};
  cmpRowsFromCsv(text).forEach((row) => {
    const persona = row.persona || personKeyFor(row);
    if (!persona || cmpState.registry[year][persona]) return; // lo registrado en este equipo tiene prioridad
    cmpState.registry[year][persona] = { ...row, persona };
  });
  saveJsonSafe(CMP.registryKey, cmpState.registry);
}

async function saveRegistryToFolder(year) {
  if (!state.sisoDirectoryHandle) return false;
  try {
    const fenix = await getDirectory(state.sisoDirectoryHandle, "FENIX");
    const dir = await getDirectory(fenix, `Programa_${year}`);
    await writeTextFile(dir, `FENIX_${year}_registro_medidas.csv`, cmpCsv(REGISTRY_COLUMNS, registryRows(year)), "text/csv;charset=utf-8");
    return true;
  } catch (error) {
    console.warn("No se guardo el registro en la carpeta", error);
    return false;
  }
}

async function saveOcrToFolder() {
  if (!state.sisoDirectoryHandle) return false;
  try {
    const dir = await getDirectory(await getDirectory(state.sisoDirectoryHandle, "FENIX"), CMP.folder);
    const columns = ["ruta_relativa", "anio", "dpi", "fecha", "ct", "ldl", "hdl", "tg", "glu", "hba1c", "error"];
    const rows = Object.entries(cmpState.ocr).map(([ruta, v]) => ({ ruta_relativa: ruta, ...v }));
    await writeTextFile(dir, CMP.ocrFile, cmpCsv(columns, rows), "text/csv;charset=utf-8");
    return true;
  } catch (error) {
    console.warn("No se guardo el OCR en la carpeta", error);
    return false;
  }
}

// =====================================================================
// 1) REGISTRO DE MEDIDAS
// =====================================================================
function registryPeople() {
  const people = new Map();
  const add = (p) => {
    if (!p || !p.nombre) return;
    const key = personKeyFor(p);
    if (!people.has(key)) people.set(key, { key, nombre: p.nombre, codigo: normalizeCode(p.codigo), dpi: String(p.dpi || "").replace(/\D/g, "") });
  };
  (state.data?.headcount || []).forEach(add);
  // Personas de FENIX que no estan en el Head Count (por nombre exacto) tambien se pueden registrar.
  const names = new Set([...people.values()].map((p) => normalizeText(p.nombre)));
  (state.fenixRecords || []).forEach((r) => {
    if (!names.has(normalizeText(r.nombre))) add({ nombre: r.nombre, codigo: r.codigo, dpi: fenixDpi(r) });
  });
  return [...people.values()];
}

function regFindPerson(query) {
  const q = normalizeText(query);
  if (!q) return null;
  const people = registryPeople();
  return (
    people.find((p) => `${p.nombre} · ${p.codigo || p.dpi || "S/C"}` === query) ||
    people.find((p) => p.codigo && p.codigo === query.trim()) ||
    people.find((p) => p.dpi && p.dpi === query.replace(/\D/g, "")) ||
    null
  );
}

function regFormYear() {
  return $("regYear")?.value || currentYear();
}

function renderRegistry() {
  const panel = $("fenixRegistry");
  if (!panel) return;
  const yearSelect = $("regYear");
  const now = Number(currentYear());
  const years = [...new Set([...availableYears(), String(now), String(now + 1)])].sort();
  const current = yearSelect.value || String(now);
  yearSelect.innerHTML = years.map((y) => `<option value="${y}" ${y === current ? "selected" : ""}>${y}</option>`).join("");
  const options = registryPeople()
    .slice(0, 3000)
    .map((p) => `<option value="${escapeHtml(`${p.nombre} · ${p.codigo || p.dpi || "S/C"}`)}"></option>`)
    .join("");
  $("regPeople").innerHTML = options;

  const year = regFormYear();
  const rows = registryRows(year).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  $("regCount").textContent = `${formatNumber(rows.length)} persona(s) registradas en FENIX ${year}`;
  $("regList").innerHTML = rows.length
    ? `<div class="table-wrap compact"><table>
        <thead><tr><th>Fecha</th><th>Colaborador</th><th>Peso</th><th>IMC</th><th>% grasa</th><th>Cintura</th><th>PA</th><th>FC</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td>${escapeHtml(formatDate(r.fecha) || "")}</td>
              <td><strong>${escapeHtml(r.nombre || "")}</strong><small class="reg-id">${escapeHtml(r.codigo || r.dpi || "S/C")}</small></td>
              <td>${escapeHtml(r.peso_kg || "")}</td><td>${escapeHtml(r.imc || "")}</td><td>${escapeHtml(r.grasa_pct || "")}</td>
              <td>${escapeHtml(r.cintura_cm || "")}</td><td>${escapeHtml(r.presion_arterial || "")}</td><td>${escapeHtml(r.frecuencia_cardiaca || "")}</td>
              <td class="reg-actions"><button class="ghost-button" data-reg-edit="${escapeHtml(r.persona)}">Editar</button><button class="ghost-button danger" data-reg-delete="${escapeHtml(r.persona)}">Quitar</button></td>
            </tr>`,
          )
          .join("")}</tbody></table></div>`
    : '<p class="muted-line">Todavía no hay medidas registradas este año.</p>';
}

function regClearForm() {
  cmpState.editingKey = null;
  $("regPerson").value = "";
  $("regPersonInfo").textContent = "";
  $("regDate").value = localToday();
  MEASURE_FIELDS.forEach((f) => ($(`reg_${f.key}`).value = ""));
  $("regSave").textContent = "💾 Guardar medidas";
}

function regUpdateImc() {
  const w = toNum($("reg_peso_kg").value);
  const h = toNum($("reg_estatura_cm").value);
  $("reg_imc").value = w && h ? (w / (h / 100) ** 2).toFixed(1) : "";
}

function regLoadEntry(key) {
  const entry = cmpState.registry[regFormYear()]?.[key];
  if (!entry) return;
  cmpState.editingKey = key;
  $("regPerson").value = `${entry.nombre} · ${entry.codigo || entry.dpi || "S/C"}`;
  $("regPersonInfo").textContent = "Editando registro existente";
  $("regDate").value = entry.fecha || "";
  MEASURE_FIELDS.forEach((f) => ($(`reg_${f.key}`).value = entry[f.key] || ""));
  $("regSave").textContent = "💾 Actualizar medidas";
  $("fenixRegistry").scrollIntoView({ block: "start", behavior: "smooth" });
}

async function regSave() {
  const year = regFormYear();
  const typed = $("regPerson").value.trim();
  const found = regFindPerson(typed);
  const existing = cmpState.editingKey ? cmpState.registry[year]?.[cmpState.editingKey] : null;
  const person = found || existing || (typed ? { nombre: typed.split(" · ")[0].toUpperCase(), codigo: "", dpi: "" } : null);
  if (!person || !person.nombre) {
    $("regPersonInfo").textContent = "Escribe o elige al colaborador.";
    return;
  }
  const pa = $("reg_presion_arterial").value.trim();
  if (pa && !parsePA(pa)) {
    $("regPersonInfo").textContent = "La presión debe escribirse como 120/80.";
    return;
  }
  const key = existing?.persona || personKeyFor(person);
  const entry = {
    persona: key,
    dpi: person.dpi || "",
    codigo: person.codigo || "",
    nombre: person.nombre,
    fecha: $("regDate").value || localToday(),
    registrado_por: state.user?.label || "",
  };
  MEASURE_FIELDS.forEach((f) => (entry[f.key] = $(`reg_${f.key}`).value.trim()));
  if (!MEASURE_FIELDS.some((f) => f.type !== "auto" && entry[f.key])) {
    $("regPersonInfo").textContent = "Escribe al menos una medida.";
    return;
  }
  cmpState.registry[year] = cmpState.registry[year] || {};
  if (existing && existing.persona !== key) delete cmpState.registry[year][existing.persona];
  cmpState.registry[year][key] = entry;
  saveJsonSafe(CMP.registryKey, cmpState.registry);
  const saved = await saveRegistryToFolder(year);
  hideBusy(true, saved ? `Medidas de ${person.nombre} guardadas` : "Guardado en este equipo (falta seleccionar carpeta SISO)");
  regClearForm();
  renderRegistry();
  renderYearSelectors();
  renderCompare();
  $("regPerson").focus();
}

async function regDelete(key) {
  const year = regFormYear();
  const entry = cmpState.registry[year]?.[key];
  if (!entry || !window.confirm(`¿Quitar las medidas ${year} de ${entry.nombre}?`)) return;
  delete cmpState.registry[year][key];
  saveJsonSafe(CMP.registryKey, cmpState.registry);
  await saveRegistryToFolder(year);
  renderRegistry();
  renderCompare();
}

function regExport() {
  const year = regFormYear();
  downloadExcel(
    `fenix_${year}_registro_medidas.xls`,
    `Programa FENIX ${year} - Registro de medidas`,
    ["Fecha", "Código", "DPI", "Nombre", ...MEASURE_FIELDS.map((f) => f.label), "Registrado por"],
    registryRows(year).map((r) => [formatDate(r.fecha), r.codigo || "", r.dpi || "", r.nombre, ...MEASURE_FIELDS.map((f) => r[f.key] || ""), r.registrado_por || ""]),
  );
}

// =====================================================================
// 2) GANADORES (comparativo entre dos años)
// =====================================================================
let pdfjsLib = null;
let ocrWorker = null;

async function cmpLoadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  for (const base of CMP.pdfjsSources) {
    try {
      const lib = await import(`${base}pdf.min.mjs`);
      lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
      pdfjsLib = lib;
      return lib;
    } catch (error) {
      console.warn("No cargo pdf.js desde", base, error);
    }
  }
  throw new Error("No se pudo cargar el lector de PDF. Revisa la conexion a internet de la computadora.");
}

function cmpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No cargo ${src}`));
    document.head.appendChild(script);
  });
}

async function cmpLoadOcr() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) {
    for (const src of CMP.tesseractSources) {
      try {
        await cmpLoadScript(src);
        if (window.Tesseract) break;
      } catch (error) {
        console.warn(error);
      }
    }
    if (!window.Tesseract) throw new Error("No se pudo cargar el lector de texto (OCR). Revisa la conexion a internet de la computadora.");
  }
  ocrWorker = await window.Tesseract.createWorker("eng");
  return ocrWorker;
}

async function cmpReadPdf(record) {
  const file = await getFileFromRelativePath(state.sisoDirectoryHandle, `FENIX/${record.ruta_relativa}`);
  const pdf = await (await cmpLoadPdfjs()).getDocument({ data: await file.arrayBuffer() }).promise;
  const worker = await cmpLoadOcr();
  const values = {};
  // La quimica suele estar en la ultima hoja: se lee de atras hacia adelante y se detiene al encontrarla.
  for (let pageNumber = pdf.numPages; pageNumber >= 1; pageNumber -= 1) {
    if (cmpState.stop) break;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const { data } = await worker.recognize(canvas.toDataURL("image/png"));
    const found = parseLabText(data.text);
    Object.entries(found).forEach(([k, v]) => {
      if (values[k] == null) values[k] = v;
    });
    page.cleanup();
    if (lipidCount(values) >= 4) break;
  }
  await pdf.destroy();
  return values;
}

async function cmpRun() {
  if (cmpState.running) return;
  if (!state.sisoDirectoryHandle || !state.fenixRecords.length) {
    $("cmpStatus").textContent = "Primero ve a Vacunaciones → Cargar datos → Seleccionar carpeta SISO, para que SISO encuentre los PDF de FENIX.";
    return;
  }
  const { base, comp } = selectedYears();
  const pending = [];
  cmpParticipants(base, comp).forEach((p) =>
    [base, comp].forEach((y) =>
      p.files[y].forEach((r) => {
        if (!cmpState.ocr[r.ruta_relativa]) pending.push(r);
      }),
    ),
  );
  cmpState.running = true;
  cmpState.stop = false;
  $("cmpRun").disabled = true;
  $("cmpStop").hidden = false;
  $("cmpProgressWrap").hidden = false;
  showBusy("Leyendo laboratorios FENIX...");
  let done = 0;
  let errors = 0;
  try {
    for (const record of pending) {
      if (cmpState.stop) break;
      $("cmpStatus").textContent = `Leyendo ${done + 1} de ${pending.length}: ${record.nombre} (${record.anio}). Puedes seguir usando la computadora; no cierres SISO.`;
      try {
        const values = await cmpReadPdf(record);
        cmpState.ocr[record.ruta_relativa] = { ...values, anio: fenixYear(record), leido: localToday() };
      } catch (error) {
        if (/cargar|conexion/i.test(error.message)) throw error;
        errors += 1;
        console.warn("No se pudo leer", record.ruta_relativa, error);
        cmpState.ocr[record.ruta_relativa] = { error: error.message.slice(0, 120), anio: fenixYear(record) };
      }
      done += 1;
      $("cmpProgressBar").style.width = `${Math.round((done / Math.max(pending.length, 1)) * 100)}%`;
      if (done % 5 === 0) {
        saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
        renderCompare();
      }
    }
    saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
    await saveOcrToFolder();
    hideBusy(true, cmpState.stop ? "Lectura detenida (se guardó el avance)" : "Laboratorios leídos");
    $("cmpStatus").textContent = cmpState.stop
      ? `Detenido. Se leyeron ${done} PDF; al volver a presionar el botón continúa donde se quedó.`
      : `Listo: ${done} PDF leídos${errors ? `, ${errors} con problema (se muestran como "sin datos")` : ""}. Resultados guardados en FENIX/Comparativo.`;
  } catch (error) {
    hideBusy(false, "No se pudo leer los PDF");
    $("cmpStatus").textContent = `${error.message} El avance se guardó; puedes volver a intentarlo.`;
    saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
  } finally {
    cmpState.running = false;
    $("cmpRun").disabled = false;
    $("cmpStop").hidden = true;
    $("cmpProgressWrap").hidden = true;
    renderCompare();
  }
}

// ---------- Puntajes ----------
function bestValues(records) {
  // Si hay varios PDF en el año, se usa el que tenga mas valores (y el mas reciente).
  const read = records.map((r) => cmpState.ocr[r.ruta_relativa]).filter((v) => v && !v.error);
  read.sort((a, b) => lipidCount(b) - lipidCount(a) || String(b.fecha || "").localeCompare(String(a.fecha || "")));
  return read[0] || null;
}

function clip(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function labScore(before, after) {
  let score = 0;
  let used = 0;
  const detail = {};
  MARKERS.forEach((m) => {
    const a = before?.[m.key];
    const b = after?.[m.key];
    if (a == null || b == null || a <= 0) return;
    used += 1;
    const pct = m.better === "down" ? ((a - b) / a) * 100 : ((b - a) / a) * 100;
    let pts = pct >= 0 ? clip(pct, 50) : clip(pct * m.penalty, 50 * m.penalty);
    if (!m.isNormal(a) && m.isNormal(b)) pts += 10;
    if (m.isNormal(a) && !m.isNormal(b)) pts -= 10 * m.penalty;
    score += pts;
    detail[m.key] = { a, b, pct, improved: pct > 0 };
  });
  return { score: used >= 3 ? score : null, used, detail };
}

function bodyScore(before, after) {
  let score = 0;
  const notes = [];
  const w1 = toNum(before.peso_kg);
  const w2 = toNum(after.peso_kg);
  if (w1 && w2) {
    const pct = ((w1 - w2) / w1) * 100;
    score += pct >= 0 ? clip(pct * 2, 25) : clip(pct * 2 * WEIGHT_GAIN_PENALTY, 25 * WEIGHT_GAIN_PENALTY);
    notes.push(`peso ${w1 - w2 >= 0 ? "−" : "+"}${Math.abs(w1 - w2).toFixed(1)} kg`);
  }
  const g1 = toNum(before.grasa_pct);
  const g2 = toNum(after.grasa_pct);
  if (g1 != null && g2 != null) {
    score += clip((g1 - g2) * 2, 20);
    notes.push(`grasa ${g1 - g2 >= 0 ? "−" : "+"}${Math.abs(g1 - g2).toFixed(1)} pts`);
  }
  const p1 = parsePA(before.presion_arterial);
  const p2 = parsePA(after.presion_arterial);
  if (p1 && p2) {
    const high = (p) => p.sys >= 130 || p.dia >= 85;
    if (high(p1) && !high(p2)) score += 10;
    if (!high(p1) && high(p2)) score -= 10;
  }
  const filled = ["peso_kg", "grasa_pct", "presion_arterial"].some((k) => String(after[k] ?? "").trim());
  return { score, notes, filled };
}

function cmpRanking(base, comp) {
  return cmpParticipants(base, comp)
    .map((person) => {
      const before = bestValues(person.files[base]);
      const after = bestValues(person.files[comp]);
      if (!person.dpi) person.dpi = after?.dpi || before?.dpi || "";
      return { person, before, after, lab: labScore(before, after) };
    })
    .filter((row) => row.lab.score != null)
    .sort((a, b) => b.lab.score - a.lab.score);
}

function cmpEnrich(row, base, comp, pos) {
  const mBefore = measuresFor(row.person, base);
  const mAfter = measuresFor(row.person, comp);
  const body = bodyScore(mBefore, mAfter);
  return { ...row, pos, mBefore, mAfter, body, total: row.lab.score + body.score };
}

function cmpTop(base, comp) {
  const ranking = cmpRanking(base, comp);
  const top = ranking.slice(0, CMP.topLab).map((row, i) => cmpEnrich(row, base, comp, i + 1));
  return { ranking, top, finals: [...top].sort((a, b) => b.total - a.total) };
}

// ---------- Pantalla del comparativo ----------
function fmt(value, digits = 0) {
  return value == null || value === "" ? "—" : Number(value).toFixed(digits);
}

function changeCell(d) {
  if (!d) return '<td class="cmp-na">—</td>';
  const cls = d.improved ? "up" : d.pct === 0 ? "" : "down";
  return `<td class="cmp-change ${cls}"><span>${fmt(d.a)} → ${fmt(d.b)}</span><small>${d.improved ? "▲" : d.pct === 0 ? "=" : "▼"} ${Math.abs(d.pct).toFixed(0)}%</small></td>`;
}

function renderCompare() {
  const box = $("cmpResults");
  if (!box) return;
  renderYearSelectors();
  const { base, comp } = selectedYears();
  const participants = cmpParticipants(base, comp);
  const files = participants.flatMap((p) => [...p.files[base], ...p.files[comp]]);
  const readFiles = files.filter((r) => cmpState.ocr[r.ruta_relativa]).length;
  const imp = cmpState.imported[base] || {};
  const regBase = registryRows(base).length;
  const regComp = registryRows(comp).length;
  $("cmpParticipants").textContent = state.fenixRecords.length
    ? `${formatNumber(participants.length)} personas tienen FENIX ${base} y ${comp} (${formatNumber(files.length)} PDF). Leídos: ${formatNumber(readFiles)}. ` +
      `Medidas ${base}: ${formatNumber((imp.antro || []).length + regBase)} · Medidas ${comp}: ${formatNumber(regComp + ((cmpState.imported[comp] || {}).antro || []).length)}.`
    : "Primero carga la carpeta SISO (Vacunaciones → Cargar datos).";
  $("cmpRun").textContent = readFiles && readFiles < files.length ? "📄 Continuar lectura de PDF" : readFiles ? "🔄 Leer PDF nuevos" : "📄 Leer laboratorios de los PDF";

  const { ranking, top, finals } = cmpTop(base, comp);
  if (!ranking.length) {
    box.innerHTML = readFiles ? '<p class="muted-line">Aún no hay suficientes laboratorios leídos para comparar.</p>' : "";
    return;
  }
  const anyMeasures = top.some((r) => r.body.filled);
  const medal = ["🥇", "🥈", "🥉", "🏅", "🏅"];
  const podium = finals
    .slice(0, CMP.topFinal)
    .map(
      (r, i) => `<article class="cmp-winner">
        <span class="cmp-medal">${medal[i]}</span>
        <strong>${escapeHtml(r.person.nombre)}</strong>
        <span>${r.total.toFixed(0)} pts${r.body.notes.length ? ` · ${escapeHtml(r.body.notes.join(", "))}` : ""}</span>
      </article>`,
    )
    .join("");
  const input = (r, field, placeholder) =>
    `<span class="cmp-was">${base}: ${escapeHtml(r.mBefore[field] || "—")}</span><input data-measure="${field}" data-person="${escapeHtml(r.person.key)}" value="${escapeHtml(r.mAfter[field] || "")}" placeholder="${placeholder}" />`;
  // Vista: Top 15, todos, o lo que se busque (cualquier participante, con su lugar en el ranking).
  const query = normalizeText($("cmpSearch")?.value || "").trim();
  let view;
  if (query) {
    view = ranking
      .map((row, i) => ({ row, pos: i + 1 }))
      .filter(({ row }) => normalizeText(`${row.person.nombre} ${row.person.dpi || ""} ${row.person.codigo || ""}`).includes(query))
      .map(({ row, pos }) => (pos <= CMP.topLab ? top[pos - 1] : cmpEnrich(row, base, comp, pos)));
  } else if (cmpState.showAll) {
    view = ranking.map((row, i) => (i < CMP.topLab ? top[i] : cmpEnrich(row, base, comp, i + 1)));
  } else {
    view = top;
  }
  if ($("cmpShowAll")) $("cmpShowAll").textContent = cmpState.showAll ? `Ver solo el Top ${CMP.topLab}` : `Ver los ${formatNumber(ranking.length)}`;
  const winners = new Set(finals.slice(0, CMP.topFinal).map((r) => r.person.key));
  const pdfButtons = (r) =>
    [base, comp]
      .map((y) => {
        const file = r.person.files[y]?.[0];
        return file ? `<button class="pdf-mini" data-open-fenix="${file.id}" title="Abrir laboratorio ${y}">PDF ${y}</button>` : "";
      })
      .join("");
  const rows = view
    .map((r) => `<tr class="${winners.has(r.person.key) && anyMeasures ? "cmp-top" : ""}">
        <td class="cmp-pos">${r.pos}${r.pos > CMP.topLab ? `<small>de ${formatNumber(ranking.length)}</small>` : ""}</td>
        <td><strong>${escapeHtml(r.person.nombre)}</strong><small>${escapeHtml(r.person.dpi || r.person.codigo || "")}</small><span class="pdf-links">${pdfButtons(r)}</span></td>
        ${MARKERS.map((mk) => changeCell(r.lab.detail[mk.key])).join("")}
        <td class="cmp-pts">${r.lab.score.toFixed(0)}</td>
        <td>${input(r, "peso_kg", `kg ${comp}`)}</td>
        <td>${input(r, "grasa_pct", `% ${comp}`)}</td>
        <td>${input(r, "presion_arterial", "120/80")}</td>
        <td class="cmp-pts total">${r.total.toFixed(0)}</td>
      </tr>`)
    .join("");

  box.innerHTML = `
    ${anyMeasures ? `<div class="cmp-podium">${podium}</div>` : `<p class="cmp-hint">👇 Llena (o registra en "Registro de medidas") peso, % de grasa y presión ${comp} de estas ${top.length} personas para ver el Top ${CMP.topFinal} final.</p>`}
    <div class="cmp-toolbar">
      <span>${formatNumber(ranking.length)} participantes con laboratorios comparables · ${
        query ? `${formatNumber(view.length)} resultado(s) de la búsqueda` : cmpState.showAll ? "se muestran todos" : `se muestran los ${top.length} mejores`
      }</span>
      <div><button class="primary-button" id="cmpExport">📊 Exportar Excel</button></div>
    </div>
    <div class="table-wrap cmp-table">
      <table>
        <thead><tr>
          <th>#</th><th>Colaborador</th>
          ${MARKERS.map((mk) => `<th>${mk.label}<small>${base} → ${comp}</small></th>`).join("")}
          <th>Pts lab</th><th>Peso (kg)</th><th>% grasa</th><th>Presión</th><th>Total</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="${MARKERS.length + 7}">Nadie con ese nombre o DPI tiene laboratorios comparables en ${base} y ${comp}.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function cmpExport() {
  const { base, comp } = selectedYears();
  const { ranking, top, finals } = cmpTop(base, comp);
  const rows = ranking.map((row, i) => (i < CMP.topLab ? top[i] : cmpEnrich(row, base, comp, i + 1)));
  const cols = [];
  ["Col. total", "LDL", "HDL", "Triglic.", "Glucosa"].forEach((l) => cols.push(`${l} ${base}`, `${l} ${comp}`));
  downloadExcel(
    `fenix_ganadores_${base}_vs_${comp}.xls`,
    `Programa FENIX - Ganadores ${base} vs ${comp}`,
    ["Lugar final (Top 15)", "Lugar laboratorio", "Nombre", "DPI / código", ...cols, "Puntos laboratorio", `Peso ${base}`, `Peso ${comp}`, `% grasa ${base}`, `% grasa ${comp}`, `PA ${base}`, `PA ${comp}`, "Puntos total"],
    rows.map((r) => [
      r.pos <= CMP.topLab ? finals.findIndex((f) => f.person.key === r.person.key) + 1 : "", r.pos, r.person.nombre, r.person.dpi || r.person.codigo || "",
      ...MARKERS.flatMap((m) => [r.before?.[m.key] ?? "", r.after?.[m.key] ?? ""]),
      r.lab.score.toFixed(1), r.mBefore.peso_kg || "", r.mAfter.peso_kg || "", r.mBefore.grasa_pct || "", r.mAfter.grasa_pct || "",
      r.mBefore.presion_arterial || "", r.mAfter.presion_arterial || "", r.total.toFixed(1),
    ]),
  );
}

// Lo que se escribe en la tabla de ganadores tambien queda en el registro del año comparado.
async function cmpSaveInlineMeasure(input) {
  const { base, comp } = selectedYears();
  const person = cmpParticipants(base, comp).find((p) => p.key === input.dataset.person);
  if (!person) return;
  const value = input.value.trim();
  if (input.dataset.measure === "presion_arterial" && value && !parsePA(value)) {
    input.classList.add("invalid");
    return;
  }
  input.classList.remove("invalid");
  cmpState.registry[comp] = cmpState.registry[comp] || {};
  const entry = cmpState.registry[comp][person.key] || {
    persona: person.key,
    dpi: person.dpi || "",
    codigo: normalizeCode(person.codigo),
    nombre: person.nombre,
    fecha: localToday(),
    registrado_por: state.user?.label || "",
  };
  entry[input.dataset.measure] = value;
  cmpState.registry[comp][person.key] = entry;
  saveJsonSafe(CMP.registryKey, cmpState.registry);
  await saveRegistryToFolder(comp);
  renderCompare();
  renderRegistry();
}

// ---------- Eventos ----------
document.addEventListener("DOMContentLoaded", () => {
  if (!$("fenixCompare")) return;
  $("cmpRun").addEventListener("click", cmpRun);
  $("cmpStop").addEventListener("click", () => {
    cmpState.stop = true;
    $("cmpStatus").textContent = "Deteniendo al terminar el PDF actual...";
  });
  ["cmpBaseYear", "cmpCompYear"].forEach((id) =>
    $(id).addEventListener("change", () => {
      const years = availableYears();
      let base = $("cmpBaseYear").value;
      let comp = $("cmpCompYear").value;
      // Si los años chocan, se ajusta el otro automaticamente.
      if (base >= comp) {
        if (id === "cmpCompYear") base = years.filter((y) => y < comp).pop() || base;
        else comp = years.find((y) => y > base) || comp;
      }
      if (base >= comp) {
        $("cmpStatus").textContent = "El año a comparar debe ser posterior al año base.";
        renderYearSelectors();
        return;
      }
      saveJsonSafe(CMP.prefsKey, { base, comp });
      $("cmpStatus").textContent = "";
      cmpState.showAll = false;
      renderCompare();
    }),
  );
  $("cmpResults").addEventListener("change", (event) => {
    const input = event.target.closest("[data-measure]");
    if (input) cmpSaveInlineMeasure(input);
  });
  $("cmpResults").addEventListener("click", (event) => {
    if (event.target.closest("#cmpExport")) cmpExport();
    const pdf = event.target.closest("[data-open-fenix]");
    if (pdf) openFenixPdf(pdf.dataset.openFenix);
  });
  $("cmpSearch").addEventListener("input", renderCompare);
  $("cmpShowAll").addEventListener("click", () => {
    cmpState.showAll = !cmpState.showAll;
    $("cmpSearch").value = "";
    renderCompare();
  });

  // Registro de medidas
  $("regSave").addEventListener("click", regSave);
  $("regClear").addEventListener("click", regClearForm);
  $("regExport").addEventListener("click", regExport);
  $("regYear").addEventListener("change", () => {
    regClearForm();
    renderRegistry();
  });
  ["reg_peso_kg", "reg_estatura_cm"].forEach((id) => $(id).addEventListener("input", regUpdateImc));
  $("regPerson").addEventListener("change", () => {
    const person = regFindPerson($("regPerson").value);
    const year = regFormYear();
    if (!person) {
      $("regPersonInfo").textContent = $("regPerson").value ? "No está en el Head Count ni en FENIX: se guardará con el nombre escrito." : "";
      return;
    }
    const existing = cmpState.registry[year]?.[person.key];
    if (existing) {
      regLoadEntry(person.key);
      return;
    }
    const before = measuresFor(person, String(Number(year) - 1));
    $("regPersonInfo").textContent = before.peso_kg
      ? `${Number(year) - 1}: peso ${before.peso_kg} kg${before.grasa_pct ? ` · grasa ${before.grasa_pct}%` : ""}${before.presion_arterial ? ` · PA ${before.presion_arterial}` : ""}`
      : "Sin medidas del año anterior.";
  });
  $("regList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-reg-edit]");
    const del = event.target.closest("[data-reg-delete]");
    if (edit) regLoadEntry(edit.dataset.regEdit);
    if (del) regDelete(del.dataset.regDelete);
  });
  regClearForm();
  renderRegistry();
  renderCompare();
});
