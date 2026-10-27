// =====================================================================
// SISO - Ganadores del Programa FENIX (2025 vs 2026)
// Lee los PDF de laboratorio (imagenes escaneadas) con OCR en esta
// computadora, compara 2025 contra 2026 y arma el ranking.
// Ningun dato sale de la carpeta empresarial: el OCR corre en el navegador.
// =====================================================================

const CMP = {
  years: ["2025", "2026"],
  ocrCacheKey: "siso_fenix_ocr_v1",
  measuresKey: "siso_fenix_medidas_2026_v1",
  ocrFile: "laboratorios_leidos_ocr.csv",
  measuresFile: "medidas_2026_finalistas.csv",
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

const cmpState = {
  antro2025: [],
  vitals2025: [],
  running: false,
  stop: false,
  ocr: loadJsonSafe(CMP.ocrCacheKey, {}),
  measures: loadJsonSafe(CMP.measuresKey, {}),
};

const MARKERS = [
  { key: "ct", label: "Col. total", better: "down", isNormal: (v) => v < 200 },
  { key: "ldl", label: "LDL", better: "down", isNormal: (v) => v < 130 },
  { key: "hdl", label: "HDL", better: "up", isNormal: (v) => v >= 40 },
  { key: "tg", label: "Triglic.", better: "down", isNormal: (v) => v < 150 },
  { key: "glu", label: "Glucosa", better: "down", isNormal: (v) => v < 100 },
];

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

// ---------- Participantes: FENIX 2025 y 2026 de la misma persona ----------
function fenixDpi(record) {
  const fromIndex = String(record.dpi || "").replace(/\D/g, "");
  if (fromIndex.length === 13) return fromIndex;
  const fromFile = String(record.archivo || record.ruta_relativa || "").match(/(?<!\d)(\d{13})(?!\d)/);
  return fromFile ? fromFile[1] : "";
}

function cmpParticipants() {
  const groups = [];
  state.fenixRecords.forEach((record) => {
    const year = String(record.anio || "").match(/20\d{2}/)?.[0];
    if (!CMP.years.includes(year)) return;
    const dpi = fenixDpi(record);
    let group = groups.find((g) => (dpi && g.dpi === dpi) || (!dpi || !g.dpi ? samePerson(g, record) : false));
    if (!group) {
      group = { key: dpi ? `d:${dpi}` : `n:${normalizeText(record.nombre)}`, dpi, nombre: record.nombre, codigo: record.codigo, files: { 2025: [], 2026: [] } };
      groups.push(group);
    }
    if (!group.dpi && dpi) group.dpi = dpi;
    group.files[year].push(record);
  });
  return groups.filter((g) => g.files[2025].length && g.files[2026].length);
}

// ---------- Datos 2025 de antropometria y signos vitales ----------
function cmpRowsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeText(h));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "").trim()])));
}

window.onSisoFolderLoaded = async (csvFiles) => {
  for (const item of csvFiles) {
    const path = normalizeText(item.path);
    if (path.includes("antropometria") && path.includes("2025")) cmpState.antro2025 = cmpRowsFromCsv(await item.file.text());
    if (path.includes("signos_vitales") && path.includes("2025")) cmpState.vitals2025 = cmpRowsFromCsv(await item.file.text());
    if (path.endsWith(normalizeText(CMP.ocrFile))) mergeOcrCsv(await item.file.text());
    if (path.endsWith(normalizeText(CMP.measuresFile))) mergeMeasuresCsv(await item.file.text());
  }
  renderCompare();
};

function find2025(rows, person) {
  if (!rows.length) return null;
  if (person.dpi) {
    const byDpi = rows.find((r) => String(r.dpi || "").replace(/\D/g, "") === person.dpi);
    if (byDpi) return byDpi;
  }
  return rows.find((r) => samePerson({ nombre: r.nombre }, { nombre: person.nombre })) || null;
}

function toNum(value) {
  const n = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : null;
}

function parsePA(value) {
  const m = String(value || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null;
}

// ---------- OCR (pdf.js + Tesseract.js, cargados solo al usarlos) ----------
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
    let lastError = null;
    for (const src of CMP.tesseractSources) {
      try {
        await cmpLoadScript(src);
        if (window.Tesseract) break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!window.Tesseract) throw lastError || new Error("No se pudo cargar el lector de texto (OCR).");
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
  const participants = cmpParticipants();
  const pending = [];
  participants.forEach((p) => CMP.years.forEach((y) => p.files[y].forEach((r) => {
    if (!cmpState.ocr[r.ruta_relativa]) pending.push(r);
  })));
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
        cmpState.ocr[record.ruta_relativa] = { ...values, anio: String(record.anio), leido: new Date().toISOString().slice(0, 10) };
      } catch (error) {
        errors += 1;
        console.warn("No se pudo leer", record.ruta_relativa, error);
        if (/cargar|conexion/i.test(error.message)) throw error;
        cmpState.ocr[record.ruta_relativa] = { error: error.message.slice(0, 120), anio: String(record.anio) };
      }
      done += 1;
      $("cmpProgressBar").style.width = `${Math.round((done / Math.max(pending.length, 1)) * 100)}%`;
      if (done % 5 === 0) {
        saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
        renderCompare();
      }
    }
    saveJsonSafe(CMP.ocrCacheKey, cmpState.ocr);
    await cmpSaveToFolder();
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

// ---------- Guardar y recuperar en la carpeta (FENIX/Comparativo) ----------
const OCR_COLUMNS = ["ruta_relativa", "anio", "dpi", "fecha", "ct", "ldl", "hdl", "tg", "glu", "hba1c", "error"];
const MEASURE_COLUMNS = ["persona", "nombre", "dpi", "peso_2026", "grasa_2026", "pa_2026"];

function cmpCsv(columns, rows) {
  return `﻿${[columns, ...rows.map((r) => columns.map((c) => r[c] ?? ""))]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n")}`;
}

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

function mergeMeasuresCsv(text) {
  cmpRowsFromCsv(text).forEach((row) => {
    if (!row.persona || cmpState.measures[row.persona]) return;
    cmpState.measures[row.persona] = { peso: row.peso_2026, grasa: row.grasa_2026, pa: row.pa_2026 };
  });
  saveJsonSafe(CMP.measuresKey, cmpState.measures);
}

async function cmpSaveToFolder() {
  if (!state.sisoDirectoryHandle) return false;
  try {
    const dir = await getDirectory(await getDirectory(state.sisoDirectoryHandle, "FENIX"), CMP.folder);
    const ocrRows = Object.entries(cmpState.ocr).map(([ruta, v]) => ({ ruta_relativa: ruta, ...v }));
    await writeTextFile(dir, CMP.ocrFile, cmpCsv(OCR_COLUMNS, ocrRows), "text/csv;charset=utf-8");
    const people = cmpParticipants();
    const measureRows = Object.entries(cmpState.measures).map(([persona, m]) => {
      const p = people.find((x) => x.key === persona) || {};
      return { persona, nombre: p.nombre || "", dpi: p.dpi || "", peso_2026: m.peso || "", grasa_2026: m.grasa || "", pa_2026: m.pa || "" };
    });
    await writeTextFile(dir, CMP.measuresFile, cmpCsv(MEASURE_COLUMNS, measureRows), "text/csv;charset=utf-8");
    return true;
  } catch (error) {
    console.warn("No se guardo el comparativo en la carpeta", error);
    return false;
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

function labScore(v25, v26) {
  let score = 0;
  let used = 0;
  const detail = {};
  MARKERS.forEach((m) => {
    const a = v25?.[m.key];
    const b = v26?.[m.key];
    if (a == null || b == null || a <= 0) return;
    used += 1;
    const pct = m.better === "down" ? ((a - b) / a) * 100 : ((b - a) / a) * 100;
    let pts = clip(pct, 50);
    if (!m.isNormal(a) && m.isNormal(b)) pts += 10;
    if (m.isNormal(a) && !m.isNormal(b)) pts -= 10;
    score += pts;
    detail[m.key] = { a, b, pct, improved: pct > 0 };
  });
  return { score: used >= 3 ? score : null, used, detail };
}

function bodyScore(person, antro, vitals) {
  const m = cmpState.measures[person.key] || {};
  let score = 0;
  const notes = [];
  const w25 = toNum(antro?.peso_kg);
  const w26 = toNum(m.peso);
  if (w25 && w26) {
    const pct = ((w25 - w26) / w25) * 100;
    score += clip(pct * 2, 25);
    notes.push(`peso ${pct >= 0 ? "−" : "+"}${Math.abs(w25 - w26).toFixed(1)} kg`);
  }
  const g25 = toNum(antro?.grasa_pct);
  const g26 = toNum(m.grasa);
  if (g25 != null && g26 != null) {
    score += clip((g25 - g26) * 2, 20);
    notes.push(`grasa ${g25 - g26 >= 0 ? "−" : "+"}${Math.abs(g25 - g26).toFixed(1)} pts`);
  }
  const p25 = parsePA(vitals?.presion_arterial);
  const p26 = parsePA(m.pa);
  if (p25 && p26) {
    const high = (p) => p.sys >= 130 || p.dia >= 85;
    if (high(p25) && !high(p26)) score += 10;
    if (!high(p25) && high(p26)) score -= 10;
  }
  return { score, notes, filled: Boolean(m.peso || m.grasa || m.pa) };
}

function cmpRanking() {
  return cmpParticipants()
    .map((person) => {
      const v25 = bestValues(person.files[2025]);
      const v26 = bestValues(person.files[2026]);
      if (!person.dpi) person.dpi = v26?.dpi || v25?.dpi || "";
      const lab = labScore(v25, v26);
      const antro = find2025(cmpState.antro2025, person);
      const vitals = find2025(cmpState.vitals2025, person);
      return { person, v25, v26, lab, antro, vitals };
    })
    .filter((row) => row.lab.score != null)
    .sort((a, b) => b.lab.score - a.lab.score);
}

// ---------- Pantalla ----------
function fmt(value, digits = 0) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function changeCell(d, digits = 0) {
  if (!d) return '<td class="cmp-na">—</td>';
  const cls = d.improved ? "up" : d.pct === 0 ? "" : "down";
  return `<td class="cmp-change ${cls}"><span>${fmt(d.a, digits)} → ${fmt(d.b, digits)}</span><small>${d.improved ? "▲" : d.pct === 0 ? "=" : "▼"} ${Math.abs(d.pct).toFixed(0)}%</small></td>`;
}

function renderCompare() {
  const box = $("cmpResults");
  if (!box) return;
  const participants = cmpParticipants();
  const totalFiles = participants.reduce((n, p) => n + p.files[2025].length + p.files[2026].length, 0);
  const readFiles = participants.reduce(
    (n, p) => n + [...p.files[2025], ...p.files[2026]].filter((r) => cmpState.ocr[r.ruta_relativa]).length,
    0,
  );
  if ($("cmpParticipants")) {
    $("cmpParticipants").textContent = state.fenixRecords.length
      ? `${formatNumber(participants.length)} personas tienen FENIX 2025 y 2026 (${formatNumber(totalFiles)} PDF). Leídos: ${formatNumber(readFiles)}.` +
        `${cmpState.antro2025.length ? ` Antropometría 2025: ${cmpState.antro2025.length}.` : " Falta FENIX_2025_antropometria.csv."}` +
        `${cmpState.vitals2025.length ? ` Signos 2025: ${cmpState.vitals2025.length}.` : " Falta FENIX_2025_signos_vitales.csv."}`
      : "Primero carga la carpeta SISO (Vacunaciones → Cargar datos).";
  }
  if ($("cmpRun")) $("cmpRun").textContent = readFiles && readFiles < totalFiles ? "📄 Continuar lectura de PDF" : readFiles ? "🔄 Leer PDF nuevos" : "📄 Leer laboratorios de los PDF";

  const ranking = cmpRanking();
  if (!ranking.length) {
    box.innerHTML = readFiles
      ? '<p class="muted-line">Aún no hay suficientes laboratorios leídos para comparar.</p>'
      : "";
    return;
  }
  const top = ranking.slice(0, CMP.topLab).map((row) => {
    const body = bodyScore(row.person, row.antro, row.vitals);
    return { ...row, body, total: row.lab.score + body.score };
  });
  const finals = [...top].sort((a, b) => b.total - a.total);
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

  const rows = top
    .map((r, i) => {
      const m = cmpState.measures[r.person.key] || {};
      const finalPos = finals.indexOf(r);
      return `<tr class="${finalPos < CMP.topFinal && anyMeasures ? "cmp-top" : ""}">
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(r.person.nombre)}</strong><small>${escapeHtml(r.person.dpi || "")}</small></td>
        ${MARKERS.map((mk) => changeCell(r.lab.detail[mk.key], mk.key === "glu" ? 0 : 0)).join("")}
        <td class="cmp-pts">${r.lab.score.toFixed(0)}</td>
        <td><span class="cmp-was">2025: ${fmt(toNum(r.antro?.peso_kg), 1)}</span><input data-measure="peso" data-person="${escapeHtml(r.person.key)}" value="${escapeHtml(m.peso || "")}" inputmode="decimal" placeholder="kg 2026" /></td>
        <td><span class="cmp-was">2025: ${fmt(toNum(r.antro?.grasa_pct), 1)}</span><input data-measure="grasa" data-person="${escapeHtml(r.person.key)}" value="${escapeHtml(m.grasa || "")}" inputmode="decimal" placeholder="% 2026" /></td>
        <td><span class="cmp-was">2025: ${escapeHtml(r.vitals?.presion_arterial || "—")}</span><input data-measure="pa" data-person="${escapeHtml(r.person.key)}" value="${escapeHtml(m.pa || "")}" placeholder="120/80" /></td>
        <td class="cmp-pts total">${r.total.toFixed(0)}</td>
      </tr>`;
    })
    .join("");

  box.innerHTML = `
    ${anyMeasures ? `<div class="cmp-podium">${podium}</div>` : `<p class="cmp-hint">👇 Llena peso, % de grasa y presión 2026 de estas ${top.length} personas para ver el Top ${CMP.topFinal} final. Se guarda solo.</p>`}
    <div class="cmp-toolbar">
      <span>${formatNumber(ranking.length)} participantes con laboratorios comparables · se muestran los ${top.length} mejores</span>
      <div>
        <button class="ghost-button" id="cmpSave">💾 Guardar en carpeta</button>
        <button class="primary-button" id="cmpExport">📊 Exportar Excel</button>
      </div>
    </div>
    <div class="table-wrap cmp-table">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Colaborador</th>
            ${MARKERS.map((mk) => `<th>${mk.label}<small>2025 → 2026</small></th>`).join("")}
            <th>Pts lab</th><th>Peso (kg)</th><th>% grasa</th><th>Presión</th><th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function cmpExport() {
  const ranking = cmpRanking().slice(0, CMP.topLab).map((row) => {
    const body = bodyScore(row.person, row.antro, row.vitals);
    return { ...row, body, total: row.lab.score + body.score };
  });
  const finals = [...ranking].sort((a, b) => b.total - a.total);
  const m = (row, key) => (cmpState.measures[row.person.key] || {})[key] || "";
  downloadExcel(
    "fenix_ganadores_2025_vs_2026.xls",
    "Programa FENIX - Ganadores 2025 vs 2026",
    [
      "Lugar final", "Lugar laboratorio", "Nombre", "DPI",
      "Col. total 2025", "Col. total 2026", "LDL 2025", "LDL 2026", "HDL 2025", "HDL 2026",
      "Triglic. 2025", "Triglic. 2026", "Glucosa 2025", "Glucosa 2026",
      "Puntos laboratorio", "Peso 2025", "Peso 2026", "% grasa 2025", "% grasa 2026", "PA 2025", "PA 2026", "Puntos total",
    ],
    ranking.map((r, i) => [
      finals.indexOf(r) + 1, i + 1, r.person.nombre, r.person.dpi || "",
      r.v25?.ct ?? "", r.v26?.ct ?? "", r.v25?.ldl ?? "", r.v26?.ldl ?? "", r.v25?.hdl ?? "", r.v26?.hdl ?? "",
      r.v25?.tg ?? "", r.v26?.tg ?? "", r.v25?.glu ?? "", r.v26?.glu ?? "",
      r.lab.score.toFixed(1), r.antro?.peso_kg ?? "", m(r, "peso"), r.antro?.grasa_pct ?? "", m(r, "grasa"),
      r.vitals?.presion_arterial ?? "", m(r, "pa"), r.total.toFixed(1),
    ]),
  );
}

document.addEventListener("DOMContentLoaded", () => {
  if (!$("fenixCompare")) return;
  $("cmpRun").addEventListener("click", cmpRun);
  $("cmpStop").addEventListener("click", () => {
    cmpState.stop = true;
    $("cmpStatus").textContent = "Deteniendo al terminar el PDF actual...";
  });
  $("cmpResults").addEventListener("change", (event) => {
    const input = event.target.closest("[data-measure]");
    if (!input) return;
    const key = input.dataset.person;
    cmpState.measures[key] = { ...(cmpState.measures[key] || {}), [input.dataset.measure]: input.value.trim() };
    saveJsonSafe(CMP.measuresKey, cmpState.measures);
    renderCompare();
  });
  $("cmpResults").addEventListener("click", async (event) => {
    if (event.target.closest("#cmpExport")) cmpExport();
    if (event.target.closest("#cmpSave")) {
      const ok = await cmpSaveToFolder();
      hideBusy(ok, ok ? "Comparativo guardado en FENIX/Comparativo" : "Primero selecciona la carpeta SISO");
    }
  });
  renderCompare();
});
