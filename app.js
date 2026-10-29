const state = {
  data: null,
  filtered: [],
  comparison: [],
  user: null,
  headcountSource: "Sin Head Count cargado",
  sisoDirectoryHandle: null,
  fenixRecords: [],
  fenixFiltered: [],
};

// Modo app: registra el service worker para poder instalar SISO como aplicacion.
// Funciona en https (GitHub Pages) o en localhost; con doble clic (file://) se usa como pagina normal.
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("No se pudo activar el modo app.", e)));
}

const IT_DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "it";

const VACCINATION_CSV_HEADERS = ["codigo", "nombre", "vacuna", "anio", "estado", "gerencia", "tipo", "fuente", "fecha", "dosis"];

// Esquema de Hepatitis B en adultos: 3 dosis.
const HEPB_DOSES_REQUIRED = 3;
const HEPB_NAME = "Hepatitis B";

const EMPTY_DATA = {
  generated_at: "Modo local seguro: sin datos reales incluidos",
  summary: {},
  headcount: [],
  records: [],
  sources: [],
  excluded: [],
};

const $ = (id) => document.getElementById(id);

// Las contrasenas NO se guardan en texto plano. Cada usuario guarda solo
// una "huella" (hash PBKDF2-SHA256).
// Para cambiar una contrasena, pidele a Claude que genere la huella nueva.
const PASSWORD_ITERATIONS = 210000;

const users = [
  { username: "DRLEAL", label: "Dr. Leal", photo: true, salt: "d7ee09de50089ae78a9a3d5abfa1523f", hash: "0c811c26ed66e7c978c89142eb92737a9fa29e9df0e68d6ea10e229824de1b02" },
  { username: "CLINICAMEDICAIAK", label: "Clinica Medica IAK", photo: false, salt: "ef4c029480bd4e725c82967da8a7f35e", hash: "738145b288d4883cf7e50b51b7068ac5a1a060d34899f900c04ce1e97e0d014b" },
  { username: "JEFESHE", label: "Jefe SHE", photo: false, salt: "3aedb0368ff75927aae50551c7392ab1", hash: "642d767eff96477f253712fb265e25a98d9384cf1f28797ddbdc849a6108aad1" },
  { username: "ENFERMERIA1IAK", label: "Enfermeria 1 IAK", photo: false, salt: "744def2aa463b049ad582a6cc20a48f3", hash: "2f104c271ae5130d0d218d0c1135a728d4bf1c7d023e7423ea804e5e48e1c538" },
  { username: "ENFERMERIA2IAK", label: "Enfermeria 2 IAK", photo: false, salt: "f99964f7845d77c2f2e3abe4cf8133ec", hash: "8c3d5bf53b18a00ac242d7c7b3d0b8eb728bd506cc21149a09673fee3b6fe770" },
  { username: "ENFERMERIA3IAK", label: "Enfermeria 3 IAK", photo: false, salt: "769ea573f8825af133d649d88e7a5e55", hash: "bd82360ae6f2a9a84a20cc514ffab11615cd5f5a2392c73e4304f9f64a110e4a" },
  { username: "ODONTOLOGIAIAK", label: "Odontologia IAK", photo: false, salt: "7a2c44b19b6e02bcbe69b927f0008336", hash: "ed362dcfa0aa44b77a8d9284384b797ce8de25e97e6454a649f0037735f50307" },
  { username: "ENFERMERIACUBREIAK", label: "Enfermeria Cubre IAK", photo: false, salt: "9d901ab8029124073a4af0b150f8cf15", hash: "8f2a4ea6736bcfae8ac837d90aac9961a3386aeded4753b9b9bc71e8bd53070e" },
  { username: "CLINICAMEDICACUBREIAK", label: "Clinica Medica Cubre IAK", photo: false, salt: "3d37c4f16a5050d0706357b497bf0b95", hash: "9158a8ff9dbaccc3707e78336f3ff447dfe073b51516f2b27fd02a04e835ae5e" },
  { username: "ODONTOLOGIACUBREIAK", label: "Odontologia Cubre IAK", photo: false, salt: "3323464df6a1bec5be58c22d90c635ca", hash: "ecbb1c56dda68a279bfbb4291f6425ab82608b515cdcdef07eadb9a615a031bd" },
];

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return bytesToHex(bits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyLogin(username, password) {
  const user = users.find((item) => item.username === username);
  if (!user || !password) return null;
  const hash = await hashPassword(password, user.salt);
  return constantTimeEqual(hash, user.hash) ? user : null;
}

function normalizeUser(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-GT").format(value || 0);
}

function formatPercent(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueOptions(records, key) {
  return [...new Set(records.map((record) => record[key]).filter(Boolean))].sort();
}

function fillSelect(select, values, allLabel) {
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.appendChild(all);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function badgeClass(status) {
  if (status === "Pendiente oficial" || status === "No vacunado") return "pending";
  if (status === "No listado" || status === "Sin registro") return "missing";
  if (status === "Revisar") return "review";
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function recordsToCsv(records) {
  const rows = records.map((record) => [
    record.codigo || "",
    record.nombre || "",
    record.vacuna || "",
    record.anio || "",
    record.estado || "",
    record.gerencia || record.area || "",
    record.tipo || "",
    record.fuente || "",
    record.fecha || "",
    record.dosis || "",
  ]);
  return `\ufeff${[VACCINATION_CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
}

function recordKey(record) {
  return [
    normalizeText(record.codigo),
    normalizeText(record.nombre),
    normalizeText(record.vacuna),
    String(record.anio || ""),
    normalizeText(record.estado),
    normalizeText(record.fuente),
    String(record.fecha || ""),
    String(record.dosis || ""),
  ].join("|");
}

// Acepta 02-10-26, 02/10/2026, 2026-10-02 o fecha de Excel. Devuelve AAAA-MM-DD o "".
function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  return "";
}

function formatDate(value) {
  const text = String(value || "");
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = text.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  return text;
}

function recordWhen(record) {
  return record.fecha ? formatDate(record.fecha) : String(record.anio || "Sin fecha");
}

// Codigos sin numeros ("CLINICA", "S/C", "N/A") se guardan como sin codigo.
function normalizeCode(value) {
  const text = String(value || "").trim();
  return /\d/.test(text) ? text : "";
}

// Un codigo solo identifica a la persona si tiene numeros (ej. 16631).
// Textos como "CLINICA" o "S/C" no son codigos: en ese caso se usa el nombre.
function personKey(record) {
  const code = normalizeText(record.codigo).replace(/\s+/g, "");
  if (/\d/.test(code)) return `c:${code.replace(/^0+/, "")}`;
  return `n:${normalizeText(record.nombre || record.nombre_listado).replace(/\s+/g, " ")}`;
}

// Reconoce Hepatitis B aunque el nombre traiga la dosis u otra forma de escribirla:
// "Hepatitis B", "HEPATITIS B 2DA DOSIS", "Hep B", "VHB", "Hepatitis tipo B"...
function isHepB(record) {
  const name = normalizeText(record.vacuna).replace(/[^a-z0-9]+/g, " ").trim();
  if (/\bhepatitis a\b|\bvha\b|\bhep a\b/.test(name)) return false;
  return /\bhepatitis (tipo )?b\b|\bhep b\b|\bvhb\b|\bhbv\b|\bengerix\b/.test(name);
}

// Numero de dosis escrito en el nombre de la vacuna: "2da dosis", "dosis 3", "3°", "refuerzo"...
function doseFromText(text) {
  const t = normalizeText(text);
  let m = t.match(/(\d)\s*(?:ra|da|ta|ma|era|er|o|a|°|º|ª)?\s*dosis/);
  if (m) return Number(m[1]);
  m = t.match(/dosis\s*(?:no\.?|#|numero)?\s*(\d)/);
  if (m) return Number(m[1]);
  if (/\bprimera\b/.test(t)) return 1;
  if (/\bsegunda\b/.test(t)) return 2;
  if (/\btercera\b/.test(t)) return 3;
  return 0;
}

function recordDose(record) {
  return Number(record.dosis) || doseFromText(record.vacuna);
}

function isAppliedDose(record) {
  const status = normalizeText(record.estado);
  return !["no vacunado", "pendiente oficial", "sin registro", "no listado", "revisar"].includes(status);
}

function doseSortValue(record) {
  return `${record.fecha || `${record.anio || 0}-00-00`}|${String(recordDose(record) || "").padStart(2, "0")}`;
}

// Historial de dosis de Hepatitis B por persona (codigo o, si no tiene, nombre).
function hepBHistories() {
  const byPerson = new Map();
  state.data.records.filter((r) => isHepB(r) && isAppliedDose(r)).forEach((record) => {
    const key = personKey(record);
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push(record);
  });
  const result = new Map();
  byPerson.forEach((records, key) => {
    const seen = new Set();
    const doses = records
      .slice()
      .sort((a, b) => doseSortValue(a).localeCompare(doseSortValue(b)))
      .filter((r) => {
        const id = r.fecha ? `f:${r.fecha}` : `s:${normalizeText(r.fuente)}|${r.anio}|${recordDose(r) || ""}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((r, index) => ({ record: r, numero: recordDose(r) || index + 1 }));
    result.set(key, doses);
  });
  return result;
}

function hepBDoseFor(record, histories) {
  if (!isHepB(record)) return "";
  const doses = histories.get(personKey(record)) || [];
  const found = doses.find((d) => d.record === record) || doses.find((d) => recordKey(d.record) === recordKey(record));
  return found ? `${found.numero}ª` : "";
}

// ---------- Laboratorios FENIX por persona ----------
const NAME_STOPWORDS = new Set(["de", "del", "la", "las", "los", "y", "vda", "viuda", "dr", "dra", "lic", "licda", "ing", "sr", "sra"]);

function nameTokens(name) {
  return new Set(
    normalizeText(name)
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !NAME_STOPWORDS.has(word)),
  );
}

// Misma persona si coincide el codigo (numerico) o si comparten casi todos los nombres,
// sin importar el orden (FENIX suele traer apellidos primero).
function samePerson(a, b) {
  const codeA = normalizeCode(a.codigo).replace(/^0+/, "");
  const codeB = normalizeCode(b.codigo).replace(/^0+/, "");
  if (codeA && codeB) return codeA === codeB;
  const ta = nameTokens(a.nombre || a.nombre_listado);
  const tb = nameTokens(b.nombre || b.nombre_listado);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  ta.forEach((word) => {
    if (tb.has(word)) shared += 1;
  });
  const smaller = Math.min(ta.size, tb.size);
  return shared >= 2 && shared >= Math.min(3, smaller);
}

function fenixFor(person) {
  return state.fenixRecords
    .filter((f) => samePerson(person, f))
    .sort((a, b) => String(b.anio).localeCompare(String(a.anio)));
}

function fenixLabsBlock(labs) {
  if (!state.fenixRecords.length) {
    return `<div class="person-labs"><b>Laboratorios FENIX</b><p class="muted-line">Carga la carpeta SISO para ver laboratorios.</p></div>`;
  }
  if (!labs.length) {
    return `<div class="person-labs"><b>Laboratorios FENIX</b><p class="muted-line">Sin resultados FENIX encontrados.</p></div>`;
  }
  return `<div class="person-labs"><b>Laboratorios FENIX (${labs.length})</b><ul>${labs
    .slice(0, 10)
    .map(
      (f) => `<li><span class="lab-year">${escapeHtml(f.anio || "")}</span><span class="lab-file">${escapeHtml(f.tipo_documento && f.tipo_documento !== "Resultado FENIX" ? f.tipo_documento : f.archivo)}</span><button class="ghost-button lab-open" data-open-fenix="${f.id}">Ver PDF</button></li>`,
    )
    .join("")}</ul></div>`;
}

function renderHepBPanel() {
  const panel = $("hepbPanel");
  if (!panel) return;
  const { query } = currentFilters();
  if (!query || query.length < 3) {
    panel.hidden = true;
    return;
  }
  const histories = hepBHistories();
  const people = new Map();
  state.data.records.filter((r) => recordMatchesQuery(r, query)).forEach((r) => {
    const key = personKey(r);
    if (!people.has(key)) people.set(key, r);
  });
  state.data.headcount.filter((p) => recordMatchesQuery(p, query)).forEach((p) => {
    const key = personKey(p);
    if (!people.has(key)) people.set(key, p);
  });
  // Personas que solo tienen laboratorios FENIX (sin vacunas registradas).
  state.fenixRecords
    .filter((f) => [f.nombre, f.codigo, f.dpi].join(" ").toLowerCase().includes(query))
    .forEach((f) => {
      const already = [...people.values()].some((person) => samePerson(person, f));
      if (!already) people.set(`f:${personKey(f)}`, { nombre: f.nombre, codigo: normalizeCode(f.codigo), soloFenix: true });
    });
  const list = [...people.entries()].slice(0, 30);
  const recordsByPerson = new Map();
  state.data.records.forEach((r) => {
    const key = personKey(r);
    if (!recordsByPerson.has(key)) recordsByPerson.set(key, []);
    recordsByPerson.get(key).push(r);
  });
  panel.hidden = false;
  if (!list.length) {
    $("hepbList").innerHTML = '<p class="hepb-empty">Sin personas que coincidan con la busqueda.</p>';
    return;
  }
  $("hepbList").innerHTML = list
    .map(([key, person]) => {
      const doses = histories.get(key) || [];
      const count = doses.length;
      const complete = count >= HEPB_DOSES_REQUIRED;
      const statusLabel = complete ? "Esquema completo" : count ? `Faltan ${HEPB_DOSES_REQUIRED - count}` : "Sin dosis registradas";
      const statusClass = complete ? "" : count ? "pending" : "missing";
      const doseItems = doses
        .map((d) => `<li><strong>${d.numero}ª dosis</strong><span>${escapeHtml(recordWhen(d.record))}</span><small>${escapeHtml(d.record.fuente || "")}</small></li>`)
        .join("");
      return `
        <article class="hepb-card">
          <header>
            <div>
              <strong>${escapeHtml(person.nombre || person.nombre_listado || "Sin nombre")}</strong>
              <span>${escapeHtml(person.codigo || "S/C")}</span>
            </div>
            <div class="hepb-count">
              <b>${count} de ${HEPB_DOSES_REQUIRED}</b>
              <span class="badge ${statusClass}">${statusLabel}</span>
            </div>
          </header>
          ${doseItems ? `<ol class="hepb-doses">${doseItems}</ol>` : ""}
          ${otherVaccinesLine(recordsByPerson.get(key) || [])}
          ${fenixLabsBlock(fenixFor(person))}
          ${list.some(([otherKey]) => otherKey !== key && !otherKey.startsWith("f:")) && (recordsByPerson.get(key) || []).length
            ? `<label class="merge-row">Es la misma persona que:
                <select data-merge-from="${escapeHtml(key)}">
                  <option value="">Elegir...</option>
                  ${list
                    .filter(([otherKey]) => otherKey !== key && !otherKey.startsWith("f:"))
                    .map(([otherKey, other]) => `<option value="${escapeHtml(otherKey)}">${escapeHtml(other.nombre || "Sin nombre")} (${escapeHtml(other.codigo || "S/C")})</option>`)
                    .join("")}
                </select>
              </label>`
            : ""}
          ${(recordsByPerson.get(key) || []).length
            ? `<div class="edit-person">
                <button class="ghost-button edit-person-toggle" data-edit-person="${escapeHtml(key)}">✏️ Corregir nombre o código</button>
                <div class="edit-person-form" data-edit-form="${escapeHtml(key)}" hidden>
                  <label>Nombre<input data-edit-name value="${escapeHtml(person.nombre || "")}" list="headcountNames" autocomplete="off" /></label>
                  <label>Código<input data-edit-code value="${escapeHtml(normalizeCode(person.codigo))}" placeholder="Sin código" inputmode="numeric" /></label>
                  <div class="edit-person-buttons">
                    <button class="primary-button" data-edit-save="${escapeHtml(key)}">Guardar</button>
                    <button class="ghost-button" data-edit-cancel="${escapeHtml(key)}">Cancelar</button>
                  </div>
                  <small>Se corrige en todas sus vacunas (${(recordsByPerson.get(key) || []).length} registro(s)). Si escribes un código del Head Count, se usa su nombre oficial.</small>
                </div>
              </div>`
            : ""}
        </article>`;
    })
    .join("");
}

function otherVaccinesLine(records) {
  const others = [...new Set(records.filter((r) => !isHepB(r)).map((r) => `${r.vacuna} ${r.anio || ""}`.trim()))];
  if (!others.length) return "";
  return `<p class="hepb-others"><b>Otras vacunas:</b> ${escapeHtml(others.slice(0, 8).join(", "))}${others.length > 8 ? "..." : ""}</p>`;
}

function personLabel(key) {
  const fromRecord = state.data.records.find((r) => personKey(r) === key);
  const fromHeadcount = state.data.headcount.find((p) => personKey(p) === key);
  return fromHeadcount || fromRecord || null;
}

// Une a dos personas: todos los registros de "from" pasan al nombre y codigo de "to".
// Corrige nombre y/o codigo de una persona en todos sus registros de vacunas.
async function renamePerson(key, newName, newCode) {
  const nombre = String(newName || "").trim().replace(/\s+/g, " ").toUpperCase();
  const codigo = normalizeCode(newCode);
  if (!nombre) {
    alert("Escribe el nombre.");
    return;
  }
  const records = state.data.records.filter((r) => personKey(r) === key);
  if (!records.length) return;
  const newKey = personKey({ codigo, nombre });
  const others = state.data.records.filter((r) => personKey(r) === newKey && personKey(r) !== key);
  if (others.length && !window.confirm(`Ya existen ${others.length} registro(s) de "${others[0].nombre}" con ese código o nombre. ¿Unirlos con esta persona?`)) return;
  showBusy("Corrigiendo nombre...");
  state.data.records = mergeVaccinationRecords(
    [],
    state.data.records.map((r) => (personKey(r) === key ? { ...r, nombre, codigo } : r)),
  );
  persistVaccinationData();
  const saved = await saveConsolidatedIfPossible();
  populateFilters();
  $("searchInput").value = codigo || nombre.toLowerCase();
  applyFilters();
  const status = $("mergeStatus");
  if (status) {
    status.hidden = false;
    status.textContent = saved
      ? `Listo: ${records.length} registro(s) ahora están como ${nombre} (${codigo || "S/C"}). Consolidado actualizado en la carpeta SISO.`
      : `Listo: ${records.length} registro(s) corregidos. Para guardarlo en OneDrive, conecta la carpeta SISO.`;
  }
  hideBusy(true, saved ? "Nombre corregido y guardado" : "Corregido (falta guardar en carpeta)");
}

async function mergePeople(fromKey, toKey) {
  const target = personLabel(toKey);
  const source = personLabel(fromKey);
  if (!target || !source) return;
  const ok = window.confirm(
    `¿Unir "${source.nombre}" con "${target.nombre}" (${target.codigo || "S/C"})?\n\nTodos los registros de vacunas de "${source.nombre}" pasarán a "${target.nombre}". No se borra ninguna vacuna.`,
  );
  if (!ok) return;
  showBusy("Uniendo registros...");
  let changed = 0;
  state.data.records = state.data.records.map((record) => {
    if (personKey(record) !== fromKey) return record;
    changed += 1;
    return { ...record, nombre: target.nombre, codigo: normalizeCode(target.codigo) };
  });
  state.data.records = mergeVaccinationRecords([], state.data.records);
  persistVaccinationData();
  const saved = await saveConsolidatedIfPossible();
  populateFilters();
  applyFilters();
  const status = $("mergeStatus");
  if (status) {
    status.hidden = false;
    status.textContent = saved
      ? `Listo: ${changed} registro(s) unidos a ${target.nombre}. Consolidado actualizado en la carpeta SISO.`
      : `Listo: ${changed} registro(s) unidos a ${target.nombre}. Para guardarlo en OneDrive, ve a Cargar datos y selecciona la carpeta SISO.`;
  }
  hideBusy(true, saved ? "Unido y guardado" : "Unido (falta guardar en carpeta)");
}

function mergeVaccinationRecords(existing, incoming) {
  const merged = [];
  const seen = new Set();
  [...existing, ...incoming].forEach((record) => {
    const key = recordKey(record);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(record);
  });
  return merged;
}

function currentFilters() {
  return {
    year: $("yearFilter").value,
    vaccine: $("vaccineFilter").value,
    status: $("statusFilter").value,
    management: $("managementFilter").value,
    query: $("searchInput").value.trim().toLowerCase(),
  };
}

const MODULE_TITLES = {
  inicio: "Inicio",
  ocupacional: "🦺 Clínica Ocupacional",
  medica: "🩺 Clínica Médica",
  odontologia: "🦷 Clínica Odontológica",
  enfermeria: "👩‍⚕️ Enfermería",
  vacunaciones: "Clínica Ocupacional · Vacunaciones",
  fenix: "Clínica Ocupacional · FENIX",
  respaldos: "Clínica Ocupacional · Respaldos",
};

function switchModule(moduleName) {
  document.querySelectorAll(".module").forEach((module) => {
    module.classList.toggle("active", module.id === moduleName);
  });
  document.querySelectorAll("[data-module]").forEach((item) => {
    item.classList.toggle("active", item.dataset.module === moduleName);
  });
  document.body.dataset.currentModule = moduleName;
  if ($("mobileModuleTitle")) $("mobileModuleTitle").textContent = MODULE_TITLES[moduleName] || "SISO";
  if (moduleName === "vacunaciones") closeDetailSection();
  window.scrollTo({ top: 0 });
}

// Aviso amarillo "Cargando..." mientras SISO trabaja; verde "Listo" al terminar.
let busyTimer = null;
function showBusy(text = "Cargando...") {
  const el = $("busyIndicator");
  if (!el) return;
  clearTimeout(busyTimer);
  el.className = "busy-indicator is-loading";
  el.querySelector("span").textContent = text;
  el.hidden = false;
}

function hideBusy(ok = true, text = ok ? "Listo" : "No se completó") {
  const el = $("busyIndicator");
  if (!el) return;
  el.className = `busy-indicator ${ok ? "is-done" : "is-error"}`;
  el.querySelector("span").textContent = text;
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => (el.hidden = true), ok ? 3500 : 6000);
}

function renderHomeStats() {
  if (!$("homeVacStat")) return;
  const records = state.data.records.length;
  const people = state.data.headcount.length;
  $("homeVacStat").innerHTML = records || people
    ? `${formatNumber(records)} registros<span class="stat-extra"> · ${formatNumber(people)} en Head Count</span>`
    : "Sin datos cargados";
  if ($("homeOcuStat")) {
    const parts = [];
    if (people) parts.push(`${formatNumber(people)} colaboradores`);
    if (state.fenixRecords.length) parts.push(`${formatNumber(state.fenixRecords.length)} laboratorios`);
    $("homeOcuStat").textContent = parts.length ? parts.join(" · ") : "Sin datos cargados";
  }
  $("homeFenixStat").textContent = state.fenixRecords.length
    ? `${formatNumber(state.fenixRecords.length)} resultados disponibles`
    : "Sin índice cargado";
}

function showAppForUser(user) {
  state.user = user;
  document.body.classList.remove("auth-locked");
  document.body.classList.toggle("drleal-session", user.username === "DRLEAL");
  $("activeUserLabel").textContent = `Sesión: ${user.label}`;
  if ($("homeUserName")) $("homeUserName").textContent = user.label;
  if ($("barUserName")) $("barUserName").textContent = user.label;
  if ($("barInitials")) {
    $("barInitials").textContent = user.label
      .split(/\s+/)
      .filter((word) => /^[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(word))
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
  }
  switchModule("inicio");
  if (state.initDone) tryRestoreFolder();
  $("brandInitials").textContent = user.username === "DRLEAL" ? "" : "MO";
}

function initLogin() {
  const remembered = localStorage.getItem("siso_remembered_user") || "";
  $("loginUser").value = remembered;
  $("rememberUser").checked = Boolean(remembered);

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = normalizeUser($("loginUser").value);
    const password = $("loginPassword").value;
    if (!window.crypto || !crypto.subtle) {
      $("loginError").textContent = "Este navegador no permite verificar la contrasena. Abre SISO en Edge o Chrome actualizado.";
      return;
    }
    $("loginError").textContent = "Verificando...";
    const user = await verifyLogin(username, password);
    if (!user) {
      $("loginError").textContent = "Usuario o contrasena incorrecta.";
      return;
    }

    if ($("rememberUser").checked) {
      localStorage.setItem("siso_remembered_user", user.username);
    } else {
      localStorage.removeItem("siso_remembered_user");
    }
    sessionStorage.setItem("siso_active_user", user.username);
    $("loginPassword").value = "";
    $("loginError").textContent = "";
    showAppForUser(user);
  });

  $("logoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("siso_active_user");
    state.user = null;
    document.body.classList.add("auth-locked");
    document.body.classList.remove("drleal-session");
    $("loginPassword").value = "";
  });

  const activeUsername = sessionStorage.getItem("siso_active_user");
  const activeUser = users.find((user) => user.username === activeUsername);
  if (activeUser) showAppForUser(activeUser);
}

function renderKpis() {
  const metrics = summaryMetrics();
  const kpis = [
    ["Head Count activo", formatNumber(metrics.populationCount), "Personas activas según Head Count actual y filtros"],
    ["Cobertura vs Head Count", formatPercent(metrics.coverage), "Vacunados activos divididos dentro del Head Count filtrado"],
    ["Vacunados en listado", formatNumber(metrics.listedVaccinated), "Registros vacunados que aparecen en el listado filtrado"],
    ["Vacunados activos", formatNumber(metrics.activeVaccinated), "Vacunados que cruzan por código contra Head Count actual"],
    ["Pendientes HC", formatNumber(metrics.pendingHeadcount), "Activos del Head Count sin registro vacunado para el filtro"],
    ["Activos no listados", formatNumber(metrics.activeNotListed), "Activos que no aparecen en la data filtrada"],
    ["Histórico confiable", formatNumber(metrics.reliableRecords), "Registros confiables incluidos después de aplicar filtros"],
  ];

  $("kpiGrid").innerHTML = kpis
    .map(
      ([label, value, note]) => `
        <article class="kpi">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </article>
      `,
    )
    .join("");
}

function filteredHeadcount() {
  const { management, query } = currentFilters();
  let people = state.data.headcount;
  if (management) {
    people = people.filter((person) => person.gerencia === management);
  }
  if (query) {
    people = people.filter((person) => `${person.codigo} ${person.nombre} ${person.gerencia} ${person.ceco}`.toLowerCase().includes(query));
  }
  return people;
}

function summaryMetrics() {
  const people = filteredHeadcount();
  const peopleCodes = new Set(people.map((person) => String(person.codigo || "")).filter(Boolean));
  const recordCodes = new Set(state.filtered.map((record) => String(record.codigo || "")).filter(Boolean));
  const vaccinatedRecords = state.filtered.filter((record) => record.estado === "Vacunado");
  const activeVaccinatedCodes = new Set(
    vaccinatedRecords
      .map((record) => String(record.codigo || ""))
      .filter((code) => code && peopleCodes.has(code)),
  );
  const populationCount = people.length;
  const activeVaccinated = activeVaccinatedCodes.size;
  const coverage = populationCount ? activeVaccinated / populationCount : 0;
  const pendingHeadcount = Math.max(populationCount - activeVaccinated, 0);
  const activeNotListed = people.filter((person) => !recordCodes.has(String(person.codigo || ""))).length;

  return {
    populationCount,
    coverage,
    listedVaccinated: vaccinatedRecords.length,
    activeVaccinated,
    pendingHeadcount,
    activeNotListed,
    reliableRecords: state.filtered.length,
  };
}

function renderSummary() {
  const { year, vaccine } = currentFilters();
  const metrics = summaryMetrics();
  const title = [vaccine || "Todas las vacunas", year || "todos los años"].join(" - ");
  $("summaryHelp").textContent = `${title}: lectura contra ${formatNumber(metrics.populationCount)} personas del Head Count actual.`;

  const pct = Math.max(0, Math.min(metrics.coverage * 100, 100));
  $("coverageDonut").style.setProperty("--pct", `${pct}%`);
  $("coverageDonut").querySelector("span").textContent = `${pct.toFixed(1)}%`;

  const bars = [
    ["Vacunados activos", metrics.activeVaccinated, "Cruzan con Head Count"],
    ["Pendientes HC", metrics.pendingHeadcount, "Activos sin registro vacunado"],
    ["Activos no listados", metrics.activeNotListed, "No aparecen en la data filtrada"],
  ];
  const max = Math.max(...bars.map((item) => item[1]), 1);
  $("summaryBars").innerHTML = bars
    .map(
      ([label, count, note]) => `
        <div class="bar-row">
          <div class="bar-meta"><strong>${label}</strong><span>${formatNumber(count)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
          <small>${note}</small>
        </div>
      `,
    )
    .join("");

  const byStatus = grouped(state.filtered, "estado");
  $("summaryStatusList").innerHTML = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(
      ([label, count]) => `
        <div class="status-pill">
          <strong><span class="badge ${badgeClass(label)}">${label}</span></strong>
          <span>${formatNumber(count)}</span>
        </div>
      `,
    )
    .join("");
}

function populateFilters() {
  if ($("headcountNames")) {
    $("headcountNames").innerHTML = (state.data.headcount || [])
      .map((p) => `<option value="${escapeHtml(p.nombre)}">${escapeHtml(p.codigo || "")}</option>`)
      .join("");
  }
  const records = state.data.records;
  fillSelect($("yearFilter"), uniqueOptions(records, "anio"), "Todos los años");
  fillSelect($("vaccineFilter"), uniqueOptions(records, "vacuna"), "Todas las vacunas");
  fillSelect($("statusFilter"), uniqueOptions(records, "estado"), "Todos los estados");
  fillSelect($("managementFilter"), uniqueOptions([...records, ...state.data.headcount], "gerencia"), "Todas las gerencias");
  $("headcountInfo").textContent = IT_DEMO_MODE
    ? "Head Count cargado: sin archivo seleccionado"
    : `${state.headcountSource}: ${formatNumber(state.data.headcount.length)} colaboradores activos`;
}

function recordMatchesQuery(record, query) {
  if (!query) return true;
  const haystack = [
    record.codigo,
    record.nombre,
    record.nombre_listado,
    record.gerencia,
    record.area,
    record.vacuna,
    record.estado,
    record.tipo_persona,
    record.anio,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function applyFilters() {
  const { year, vaccine, status, management, query } = currentFilters();

  state.filtered = state.data.records.filter((record) => {
    if (year && String(record.anio) !== String(year)) return false;
    if (vaccine && record.vacuna !== vaccine) return false;
    if (status && record.estado !== status) return false;
    if (management && record.gerencia !== management) return false;
    return recordMatchesQuery(record, query);
  });

  renderCharts();
  renderKpis();
  renderSummary();
  renderTable();
  renderMatrix();
  renderComparison();
  renderHepBPanel();
  renderHomeStats();
}

function grouped(records, key) {
  return records.reduce((acc, record) => {
    const label = record[key] || "Sin dato";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function renderCharts() {
  const byVaccine = grouped(state.filtered, "vacuna");
  const vaccineMax = Math.max(...Object.values(byVaccine), 1);
  $("vaccineBars").innerHTML = Object.entries(byVaccine)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([label, count]) => `
        <div class="bar-row">
          <div class="bar-meta"><strong>${label}</strong><span>${formatNumber(count)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count / vaccineMax) * 100}%"></div></div>
        </div>
      `,
    )
    .join("");

  const byStatus = grouped(state.filtered, "estado");
  $("statusList").innerHTML = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([label, count]) => `
        <div class="status-pill">
          <strong><span class="badge ${badgeClass(label)}">${label}</span></strong>
          <span>${formatNumber(count)} registros</span>
        </div>
      `,
    )
    .join("");
}

function renderTable() {
  const histories = hepBHistories();
  $("resultCount").textContent = `${formatNumber(state.filtered.length)} registros`;
  $("recordsTable").innerHTML = state.filtered
    .slice(0, 600)
    .map(
      (record) => `
        <tr>
          <td>${record.codigo || "S/C"}</td>
          <td><strong>${record.nombre || record.nombre_listado}</strong><br><span>${record.fuente}</span></td>
          <td>${record.vacuna}</td>
          <td>${hepBDoseFor(record, histories) || "-"}</td>
          <td>${escapeHtml(recordWhen(record))}</td>
          <td><span class="badge ${badgeClass(record.estado)}">${record.estado}</span></td>
          <td>${record.gerencia || record.area || "Sin dato"}</td>
          <td>${record.tipo_persona || record.tipo || ""}</td>
        </tr>
      `,
    )
    .join("");
}

function statusFor(code, vaccine, year) {
  const item = state.data.records.find(
    (record) => record.codigo === code && record.vacuna === vaccine && Number(record.anio) === year,
  );
  return item ? item.estado : "Sin registro";
}

function matrixRows() {
  return filteredHeadcount().map((person) => ({
    codigo: person.codigo,
    nombre: person.nombre,
    gerencia: person.gerencia || "Sin dato",
    vha: statusFor(person.codigo, "VHA", 2023),
    influenza: statusFor(person.codigo, "Influenza", 2025),
    sarampion: statusFor(person.codigo, "Sarampion", 2026),
  }));
}

function renderMatrix() {
  $("matrixTable").innerHTML = matrixRows()
    .slice(0, 300)
    .map(
      (person) => `
        <tr>
          <td>${person.codigo}</td>
          <td><strong>${person.nombre}</strong></td>
          <td>${person.gerencia || "Sin dato"}</td>
          <td><span class="badge ${badgeClass(person.vha)}">${person.vha}</span></td>
          <td><span class="badge ${badgeClass(person.influenza)}">${person.influenza}</span></td>
          <td><span class="badge ${badgeClass(person.sarampion)}">${person.sarampion}</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderComparison() {
  const { year, vaccine, management, query } = currentFilters();
  const selectedYear = year || "";
  const selectedVaccine = vaccine || "";

  if (!selectedYear || !selectedVaccine) {
    $("comparisonCards").innerHTML = `
      <article class="comparison-card"><strong>Selección pendiente</strong><span>Elige año y vacuna para comparar contra Head Count actual.</span></article>
    `;
    $("comparisonTable").innerHTML = "";
    state.comparison = [];
    return;
  }

  const relevant = state.data.records.filter(
    (record) => String(record.anio) === String(selectedYear) && record.vacuna === selectedVaccine && record.codigo,
  );
  const byCode = new Map(relevant.map((record) => [record.codigo, record]));

  let people = filteredHeadcount();

  state.comparison = people.map((person) => {
    const record = byCode.get(person.codigo);
    const vaccinated = record && record.estado === "Vacunado";
    let status = "No vacunado";
    let detail = "No tiene registro vacunado para el filtro seleccionado.";
    if (vaccinated) {
      status = "Vacunado";
      detail = record.fuente;
    } else if (record) {
      status = record.estado;
      detail = record.fuente;
    }
    return {
      codigo: person.codigo,
      nombre: person.nombre,
      gerencia: person.gerencia || "Sin dato",
      vacuna: selectedVaccine,
      anio: selectedYear,
      estado: status,
      detalle: detail,
    };
  });

  const vaccinatedCount = state.comparison.filter((row) => row.estado === "Vacunado").length;
  const notVaccinatedCount = state.comparison.length - vaccinatedCount;
  const coverage = state.comparison.length ? vaccinatedCount / state.comparison.length : 0;

  $("comparisonHelp").textContent = `${selectedVaccine} ${selectedYear}: comparado contra ${formatNumber(state.comparison.length)} personas del Head Count actual.`;
  $("comparisonCards").innerHTML = `
    <article class="comparison-card"><span>Vacunados</span><strong>${formatNumber(vaccinatedCount)}</strong></article>
    <article class="comparison-card"><span>No vacunados / sin registro</span><strong>${formatNumber(notVaccinatedCount)}</strong></article>
    <article class="comparison-card"><span>Cobertura segun Head Count</span><strong>${formatPercent(coverage)}</strong></article>
  `;

  $("comparisonTable").innerHTML = state.comparison
    .slice(0, 500)
    .map(
      (row) => `
        <tr>
          <td>${row.codigo}</td>
          <td><strong>${row.nombre}</strong></td>
          <td>${row.gerencia}</td>
          <td>${row.vacuna} ${row.anio}</td>
          <td><span class="badge ${badgeClass(row.estado)}">${row.estado}</span></td>
          <td>${row.detalle}</td>
        </tr>
      `,
    )
    .join("");
}

function renderSources() {
  $("sourcesList").innerHTML = state.data.sources
    .map(
      (source) => `
        <div class="source-item">
          <div>
            <strong>${source.anio} - ${source.jornada}</strong><br>
            <span>${source.nota}</span>
          </div>
          <span>${source.estado}</span>
        </div>
      `,
    )
    .join("");

  $("excludedList").innerHTML = state.data.excluded
    .map(
      (source) => `
        <div class="source-item">
          <div>
            <strong>${source.anio} - ${source.jornada}</strong><br>
            <span>${source.motivo}</span>
          </div>
        </div>
      `,
    )
    .join("");
}

function buildBackupPayload() {
  return {
    tipo: "respaldo_medicina_ocupacional",
    version: "mvp-web-1",
    fecha_respaldo: new Date().toISOString(),
    filtros_actuales: currentFilters(),
    resumen: state.data.summary,
    registros: state.data.records,
    headcount: state.data.headcount,
    fuentes: state.data.sources,
    excluidas: state.data.excluded,
  };
}

function backupFileName() {
  const stamp = localStamp(true);
  return `respaldo_medicina_ocupacional_${stamp}.json`;
}

// Fecha y hora de la computadora (no hora internacional).
function localStamp(withTime = false) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}` : date;
}

function backupStamp() {
  return localStamp();
}

function safeFolderName(value) {
  return String(value || "Sin dato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function findColumn(headers, candidates) {
  const normalizedHeaders = headers.map((header) => normalizeText(header));
  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

function headcountFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const codeIndex = findColumn(headers, ["codigo", "cod", "id", "empleado"]);
  const nameIndex = findColumn(headers, ["nombre", "colaborador", "trabajador"]);
  const managementIndex = findColumn(headers, ["gerencia", "area", "departamento"]);
  const cecoIndex = findColumn(headers, ["ceco", "centro", "costo"]);
  // Columnas opcionales que usa el registro de atenciones para llenar datos solos.
  const optional = {
    puesto: findColumn(headers, ["puesto"]),
    area_personal: findColumn(headers, ["area_personal"]),
    fecha_nacimiento: findColumn(headers, ["fecha_nacimiento", "nacim"]),
    sexo: findColumn(headers, ["sexo", "genero"]),
    tipo_contrato: findColumn(headers, ["tipo_contrato", "relacion"]),
    dpi: findColumn(headers, ["dpi", "cui"]),
  };
  if (codeIndex < 0 || nameIndex < 0) {
    throw new Error("El CSV debe tener columnas de codigo y nombre.");
  }
  return rows
    .slice(1)
    .map((row) => {
      const person = {
        codigo: String(row[codeIndex] || "").trim(),
        nombre: String(row[nameIndex] || "").trim().toUpperCase(),
        gerencia: String(row[managementIndex] || "").trim().toUpperCase(),
        ceco: String(row[cecoIndex] || "").trim(),
      };
      Object.entries(optional).forEach(([key, index]) => {
        if (index >= 0 && String(row[index] || "").trim()) person[key] = String(row[index]).trim();
      });
      return person;
    })
    .filter((person) => person.codigo && person.nombre);
}

function fenixRecordsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const yearIndex = findColumn(headers, ["anio", "ano", "año"]);
  const dpiIndex = findColumn(headers, ["dpi", "identificacion"]);
  const codeIndex = findColumn(headers, ["codigo"]);
  const nameIndex = findColumn(headers, ["nombre"]);
  const fileIndex = findColumn(headers, ["archivo"]);
  const relativePathIndex = findColumn(headers, ["ruta_relativa"]);
  const statusIndex = findColumn(headers, ["estado_parseo", "estado"]);
  const typeIndex = findColumn(headers, ["tipo_documento", "tipo"]);
  if (yearIndex < 0 || nameIndex < 0 || fileIndex < 0 || relativePathIndex < 0) {
    throw new Error("El indice FENIX debe tener columnas anio, nombre, archivo y ruta_relativa.");
  }
  return rows
    .slice(1)
    .map((row, index) => ({
      id: index,
      anio: String(row[yearIndex] || "").trim(),
      dpi: String(row[dpiIndex] || "").trim(),
      codigo: String(row[codeIndex] || "").trim(),
      nombre: String(row[nameIndex] || "").trim().toUpperCase(),
      tipo_documento: String(row[typeIndex] || "Resultado FENIX").trim(),
      archivo: String(row[fileIndex] || "").trim(),
      ruta_relativa: String(row[relativePathIndex] || "").trim(),
      estado_parseo: String(row[statusIndex] || "ok").trim(),
    }))
    .filter((record) => record.nombre && record.archivo);
}

function yearFromFileName(name) {
  const match = String(name || "").match(/20\d{2}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function vaccineFromFileName(name) {
  const normalized = normalizeText(name);
  if (normalized.includes("sarampion")) return "Sarampion";
  if (normalized.includes("influenza")) return "Influenza";
  if (normalized.includes("vha") || normalized.includes("hepatitis a")) return "VHA";
  if (normalized.includes("hepatitis b")) return "Hepatitis B";
  return "Vacuna";
}

function vaccinationRecordsFromCsv(text, fileName) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const codeIndex = findColumn(headers, ["codigo", "cod", "id", "empleado"]);
  const nameIndex = findColumn(headers, ["nombre", "colaborador", "trabajador", "paciente"]);
  const vaccineIndex = findColumn(headers, ["vacuna", "inmunizacion", "jornada"]);
  const yearIndex = findColumn(headers, ["anio", "ano", "año", "year"]);
  const statusIndex = findColumn(headers, ["estado", "estatus", "status"]);
  const managementIndex = findColumn(headers, ["gerencia", "area", "departamento"]);
  const typeIndex = findColumn(headers, ["tipo", "clasificacion"]);
  const sourceIndex = findColumn(headers, ["fuente", "archivo", "origen"]);
  const dateIndex = findColumn(headers, ["fecha"]);
  const doseIndex = findColumn(headers, ["dosis"]);

  if (nameIndex < 0 && codeIndex < 0) {
    throw new Error("El CSV debe tener al menos columna de nombre o codigo.");
  }

  const fallbackYear = yearFromFileName(fileName);
  const fallbackVaccine = vaccineFromFileName(fileName);
  const fallbackSource = fileName || "Jornada cargada por CSV";

  return rows
    .slice(1)
    .map((row) => {
      const rawYear = String(row[yearIndex] || "").trim();
      const fecha = dateIndex >= 0 ? normalizeDate(row[dateIndex]) : "";
      const rawDose = doseIndex >= 0 ? String(row[doseIndex] || "").match(/\d+/)?.[0] : "";
      return {
        codigo: normalizeCode(row[codeIndex]),
        nombre: String(row[nameIndex] || "").trim().toUpperCase(),
        vacuna: String(row[vaccineIndex] || fallbackVaccine).trim(),
        anio: Number(rawYear.match(/20\d{2}/)?.[0] || fecha.slice(0, 4) || fallbackYear),
        estado: String(row[statusIndex] || "Vacunado").trim() || "Vacunado",
        gerencia: String(row[managementIndex] || "").trim().toUpperCase(),
        tipo: String(row[typeIndex] || "Jornada cargada").trim(),
        fuente: String(row[sourceIndex] || fallbackSource).trim(),
        fecha,
        dosis: rawDose ? Number(rawDose) : "",
      };
    })
    .filter((record) => record.codigo || record.nombre);
}

async function handleHeadcountUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    alert("Por ahora sube el Head Count como CSV exportado desde Excel. Asi GitHub Pages puede leerlo sin instalar nada.");
    event.target.value = "";
    return;
  }
  try {
    const text = await file.text();
    const headcount = headcountFromCsv(text);
    if (!headcount.length) throw new Error("No se encontraron colaboradores activos.");
    state.data.headcount = headcount;
    state.headcountSource = `Head Count cargado: ${file.name}`;
    localStorage.setItem("siso_headcount_override", JSON.stringify({ source: state.headcountSource, headcount }));
    populateFilters();
    applyFilters();
    $("headcountInfo").textContent = `${state.headcountSource}: ${formatNumber(headcount.length)} colaboradores activos`;
  } catch (error) {
    alert(`No se pudo cargar el Head Count. ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function handleVaccineUpload(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const loaded = [];
  try {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error(`${file.name} no es CSV. Exporta la jornada desde Excel como CSV.`);
      }
      const text = await file.text();
      const records = vaccinationRecordsFromCsv(text, file.name);
      if (!records.length) throw new Error(`${file.name} no tiene registros validos.`);
      loaded.push(...records);
      state.data.sources.push({
        anio: yearFromFileName(file.name),
        jornada: file.name,
        estado: "Cargada por usuario",
        nota: `${records.length} registros agregados desde CSV local.`,
      });
    }
    state.data.records = mergeVaccinationRecords(state.data.records, loaded);
    persistVaccinationData();
    const consolidatedSaved = await saveConsolidatedIfPossible();
    populateFilters();
    applyFilters();
    renderSources();
    $("vaccineUploadInfo").textContent = `${formatNumber(loaded.length)} registros agregados desde ${formatNumber(files.length)} archivo(s). Consolidado final: ${consolidatedSaved ? "actualizado" : "pendiente de seleccionar carpeta SISO"}.`;
  } catch (error) {
    alert(`No se pudo cargar la jornada. ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function persistVaccinationData() {
  localStorage.setItem("siso_vaccine_records_override", JSON.stringify({ records: state.data.records, sources: state.data.sources }));
}

function loadSavedHeadcount() {
  if (IT_DEMO_MODE) return;
  try {
    const saved = JSON.parse(localStorage.getItem("siso_headcount_override") || "null");
    if (saved && Array.isArray(saved.headcount) && saved.headcount.length) {
      state.data.headcount = saved.headcount;
      state.headcountSource = saved.source || "Head Count cargado previamente";
    }
  } catch {
    localStorage.removeItem("siso_headcount_override");
  }
}

function loadSavedVaccinations() {
  if (IT_DEMO_MODE) return;
  try {
    const saved = JSON.parse(localStorage.getItem("siso_vaccine_records_override") || "null");
    if (saved && Array.isArray(saved.records)) {
      state.data.records = saved.records.map((record) => ({ ...record, codigo: normalizeCode(record.codigo) }));
      if (Array.isArray(saved.sources)) state.data.sources = saved.sources;
      $("vaccineUploadInfo").textContent = `${formatNumber(saved.records.length)} registros guardados en este equipo`;
    }
  } catch {
    localStorage.removeItem("siso_vaccine_records_override");
  }
}

function clearVaccineData() {
  const confirmed = confirm("¿Deseas borrar las jornadas cargadas en este equipo? No borra archivos de OneDrive, solo limpia la vista local de SISO.");
  if (!confirmed) return;
  localStorage.removeItem("siso_vaccine_records_override");
  state.data.records = [];
  state.data.sources = [];
  state.filtered = [];
  $("vaccineUploadInfo").textContent = "Sin jornadas cargadas por el usuario";
  populateFilters();
  renderSources();
  applyFilters();
}

function downloadHeadcountTemplate() {
  const content = "\ufeffcodigo,nombre,gerencia,ceco\n10001,NOMBRE EJEMPLO,GERENCIA EJEMPLO,CECO001\n";
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_head_count_siso.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadVaccineTemplate() {
  const content = "\ufeffcodigo,nombre,vacuna,anio,estado,gerencia,tipo,fuente,fecha,dosis\n10001,NOMBRE EJEMPLO,Hepatitis B,2026,Vacunado,GERENCIA EJEMPLO,Colaborador activo,Jornada ejemplo,02/10/2026,\n";
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_jornada_vacunacion_siso.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function isHeadcountCsv(headers, fileName) {
  const normalized = normalizeText(`${fileName} ${headers.join(" ")}`);
  return (
    normalized.includes("head") ||
    normalized.includes("maestro") ||
    normalized.includes("count") ||
    (findColumn(headers, ["ceco", "centro", "costo"]) >= 0 && findColumn(headers, ["vacuna"]) < 0)
  );
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Mes y año escritos en el nombre del archivo (ej. Head_Count_Agosto_2026) -> numero comparable.
function monthKeyFromName(path) {
  const name = normalizeText(path).replace("setiembre", "septiembre");
  const year = Number(name.match(/20\d{2}/)?.[0] || 0);
  const month = MONTHS.findIndex((m) => name.includes(m)) + 1;
  return year * 13 + month;
}

// Elige el Head Count correcto: primero archivos con "Head Count" en el nombre y fuera de Control,
// luego el mes/año mas reciente del nombre y por ultimo la fecha de modificacion.
function headcountRank(item) {
  const path = normalizeText(item.path).replaceAll("\\", "/");
  const fileName = path.split("/").pop();
  const named = /head[\s_-]*count|headcount/.test(fileName) ? 1 : 0;
  const notControl = path.startsWith("control/") || path.includes("/control/") ? 0 : 1;
  const inHeadcountFolder = path.startsWith("head_count/") ? 1 : 0;
  return [named, notControl, inHeadcountFolder, monthKeyFromName(fileName), item.file.lastModified];
}

function compareRank(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function isConsolidatedVaccinationCsv(fileName) {
  const normalized = normalizeText(fileName);
  return normalized.includes("consolidado") && (normalized.includes("final") || normalized.includes("jornadas")) && normalized.includes("vacun");
}

function consolidatedPriority(item) {
  const path = normalizeText(item.path).replaceAll("\\", "/");
  const fileName = path.split("/").pop();
  if (path === "consolidado_final_vacunaciones_siso.csv") return 0;
  if (fileName === "consolidado_final_vacunaciones_siso.csv" && !path.includes("/vacunas/")) return 1;
  if (fileName === "consolidado_final_vacunaciones_siso.csv") return 2;
  if (fileName === "00_consolidado_final_vacunaciones_siso.csv") return 3;
  if (path.includes("oficial_actualizado")) return 4;
  if (path.includes("consolidado_jornadas")) return 5;
  return 9;
}

// CSV de modulos propios (FENIX, Atenciones de clinicas): no son vacunas ni Head Count.
function isFenixPath(path) {
  const p = normalizeText(path).replaceAll("\\", "/");
  return p.startsWith("fenix/") || p.startsWith("atenciones/");
}

function isFenixIndexCsv(path) {
  const normalized = normalizeText(path).replaceAll("\\", "/");
  return normalized.endsWith("fenix/fenix_indice_resultados_siso.csv") || normalized.endsWith("fenix_indice_resultados_siso.csv");
}

const NEW_JORNADAS_FOLDER = "Jornadas_nuevas";
const HISTORY_FOLDER = "Historial";
const HISTORY_KEEP = 5;

// Carpetas que SISO no lee al cargar: historial de respaldos y archivo viejo.
function isIgnoredFolder(name) {
  const normalized = normalizeText(name);
  return (
    normalized === "historial" ||
    normalized === "incorporadas" ||
    normalized.startsWith("archivo_viejo") ||
    normalized.startsWith("archivo viejo")
  );
}

function isNewJornadaPath(path) {
  return normalizeText(path).replaceAll("\\", "/").startsWith(`${normalizeText(NEW_JORNADAS_FOLDER)}/`);
}

async function collectCsvFiles(directoryHandle, prefix = "") {
  const files = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === "directory" && isIgnoredFolder(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file" && name.toLowerCase().endsWith(".csv")) {
      files.push({ path, file: await handle.getFile() });
    }
    if (handle.kind === "directory") {
      const nested = await collectCsvFiles(handle, path);
      files.push(...nested);
    }
  }
  return files;
}

// ---------- Recordar la carpeta SISO (IndexedDB) ----------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("siso", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const req = db.transaction("handles").objectStore("handles").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Sin IndexedDB: se pedira la carpeta cada vez.
  }
}

function setFolderBanner(mode, name = "") {
  const banner = $("folderBanner");
  if (!banner) return;
  if (mode === "hidden") {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.dataset.mode = mode;
  $("folderBannerTitle").textContent = mode === "reconnect" ? `Carpeta guardada: ${name || "RESPALDO DE SISO"}` : "Conecta la carpeta SISO";
  $("folderBannerText").textContent =
    mode === "reconnect"
      ? 'Presiona "Conectar" y luego "Permitir" para cargar tus datos. Si Chrome ofrece "Permitir siempre", elígelo y ya no tendrás que hacerlo.'
      : "Elige la carpeta RESPALDO DE SISO de OneDrive una sola vez; SISO la recordará.";
  $("folderBannerBtn").textContent = mode === "reconnect" ? "📂 Conectar carpeta" : "📂 Seleccionar carpeta SISO";
}

// Al abrir SISO: si Chrome ya dio permiso, carga sola; si no, muestra el boton para reconectar.
async function tryRestoreFolder() {
  if (state.sisoDirectoryHandle || !window.showDirectoryPicker) {
    if (!window.showDirectoryPicker) setFolderBanner("hidden");
    return;
  }
  const saved = await idbGet("sisoFolder");
  if (!saved || !saved.queryPermission) {
    setFolderBanner("pick");
    return;
  }
  try {
    if ((await saved.queryPermission({ mode: "readwrite" })) === "granted") {
      await loadSisoFolder(saved);
      return;
    }
  } catch {
    // se mostrara el boton
  }
  setFolderBanner("reconnect", saved.name);
}

async function folderBannerClick() {
  const saved = await idbGet("sisoFolder");
  if (saved && saved.requestPermission) {
    try {
      if ((await saved.requestPermission({ mode: "readwrite" })) === "granted") {
        await loadSisoFolder(saved);
        return;
      }
    } catch {
      // si falla, se pide elegir la carpeta
    }
  }
  await loadSisoFolder();
}

async function loadSisoFolder(presetDirectory) {
  const status = $("folderImportInfo");
  if (!window.showDirectoryPicker) {
    status.textContent = "Tu navegador no permite seleccionar carpetas. Usa Edge o Chrome actualizado, o sube los CSV con los botones individuales.";
    return;
  }

  const button = $("loadSisoFolder");
  if (button.disabled) return;
  try {
    const directory =
      presetDirectory && presetDirectory.kind === "directory" ? presetDirectory : await window.showDirectoryPicker({ mode: "readwrite" });
    idbSet("sisoFolder", directory);
    setFolderBanner("hidden");
    showBusy("Cargando carpeta SISO...");
    button.disabled = true;
    button.textContent = "Leyendo carpeta...";
    status.textContent = "Leyendo los archivos de la carpeta SISO. Puede tardar unos segundos si OneDrive esta descargandolos...";
    state.sisoDirectoryHandle = directory;
    await getDirectory(directory, NEW_JORNADAS_FOLDER);
    const csvFiles = await collectCsvFiles(directory);
    const consolidated = csvFiles
      .filter((item) => !isNewJornadaPath(item.path) && isConsolidatedVaccinationCsv(item.path))
      .sort((a, b) => consolidatedPriority(a) - consolidatedPriority(b) || b.file.lastModified - a.file.lastModified || b.file.size - a.file.size)[0];
    const fenixIndex = csvFiles.find((item) => isFenixIndexCsv(item.path));
    let headcountLoaded = 0;
    let vaccineLoaded = 0;
    let vaccineFiles = 0;
    let fenixLoaded = 0;
    let newJornadas = 0;
    let bestHeadcount = null;
    for (const item of csvFiles) {
      if (isFenixPath(item.path) || isNewJornadaPath(item.path) || isConsolidatedVaccinationCsv(item.path) || isFenixIndexCsv(item.path)) continue;
      const firstLine = (await item.file.slice(0, 4096).text()).split(/\r?\n/)[0] || "";
      const headers = parseCsv(firstLine)[0] || [];
      if (!isHeadcountCsv(headers, item.path)) continue;
      if (!bestHeadcount || compareRank(headcountRank(item), headcountRank(bestHeadcount)) > 0) bestHeadcount = item;
    }
    let headcountModified = -1;
    let headcountPath = "";
    const incorporatedFiles = [];
    state.data.records = [];
    state.data.sources = [];

    for (const item of csvFiles) {
      // Los CSV dentro de FENIX (indice, programa 2025, comparativo) no son vacunas ni Head Count.
      if (isFenixPath(item.path)) continue;
      const text = await item.file.text();
      const rows = parseCsv(text);
      if (!rows.length) continue;
      if (!isNewJornadaPath(item.path) && isHeadcountCsv(rows[0], item.path)) {
        // Solo se usa el Head Count elegido (ver headcountRank); los demas se ignoran.
        if (!bestHeadcount || item.path !== bestHeadcount.path) continue;
        const headcount = headcountFromCsv(text);
        if (headcount.length) {
          headcountModified = item.file.lastModified;
          headcountPath = item.path;
          state.data.headcount = headcount;
          state.headcountSource = `Head Count cargado desde carpeta: ${item.path}`;
          localStorage.setItem("siso_headcount_override", JSON.stringify({ source: state.headcountSource, headcount }));
          headcountLoaded = headcount.length;
        }
      } else if (!consolidated || item.path === consolidated.path || isNewJornadaPath(item.path)) {
        const records = vaccinationRecordsFromCsv(text, item.path);
        if (records.length) {
          if (isNewJornadaPath(item.path)) {
            newJornadas += 1;
            incorporatedFiles.push(item);
          }
          state.data.records = mergeVaccinationRecords(state.data.records, records);
          state.data.sources.push({
            anio: yearFromFileName(item.path),
            jornada: item.path,
            estado: consolidated && item.path === consolidated.path ? "Consolidado final cargado" : isNewJornadaPath(item.path) ? "Jornada nueva incorporada" : "Cargada desde carpeta SISO",
            nota: `${records.length} registros agregados desde CSV local.`,
          });
          vaccineLoaded += records.length;
          vaccineFiles += 1;
        }
      }
    }

    if (fenixIndex) {
      const text = await fenixIndex.file.text();
      state.fenixRecords = fenixRecordsFromCsv(text);
      state.fenixFiltered = state.fenixRecords;
      fenixLoaded = state.fenixRecords.length;
      renderFenix();
    } else {
      state.fenixRecords = [];
      state.fenixFiltered = [];
      renderFenix();
    }

    let movedFiles = 0;
    if (vaccineLoaded) {
      persistVaccinationData();
      const saved = await saveConsolidatedIfPossible();
      // Ya quedaron dentro del consolidado: se pasan a Jornadas_nuevas/Incorporadas para no leerlas otra vez.
      if (saved && incorporatedFiles.length) movedFiles = await moveToIncorporated(directory, incorporatedFiles);
    }

    populateFilters();
    renderSources();
    applyFilters();
    $("headcountInfo").textContent = IT_DEMO_MODE
    ? "Head Count cargado: sin archivo seleccionado"
    : `${state.headcountSource}: ${formatNumber(state.data.headcount.length)} colaboradores activos`;
    $("vaccineUploadInfo").textContent = vaccineLoaded
      ? `${formatNumber(vaccineLoaded)} registros agregados desde ${formatNumber(vaccineFiles)} archivo(s)`
      : $("vaccineUploadInfo").textContent;
    status.textContent = `Carpeta revisada: ${formatNumber(csvFiles.length)} CSV. ${consolidated ? "Se uso el consolidado final." : "No habia consolidado final, se leyeron CSV separados."}${newJornadas ? ` Jornadas nuevas incorporadas: ${formatNumber(newJornadas)}${movedFiles ? " (movidas a Jornadas_nuevas/Incorporadas)" : ""}.` : ""} Head Count: ${headcountLoaded ? `${formatNumber(headcountLoaded)} (${headcountPath})` : "sin cambios"}. Jornadas: ${formatNumber(vaccineLoaded)} registros.`;
    if (fenixLoaded) {
      $("fenixSummary").textContent = `Indice FENIX cargado desde ${fenixIndex.path}: ${formatNumber(fenixLoaded)} resultados PDF disponibles.`;
    }
    for (const hook of window.sisoFolderHooks || []) {
      try {
        await hook(csvFiles, directory);
      } catch (error) {
        console.warn("Error al cargar un modulo desde la carpeta", error);
      }
    }
    hideBusy(true, `Listo: ${formatNumber(state.data.records.length)} registros cargados`);
  } catch (error) {
    if (error.name !== "AbortError") hideBusy(false, "No se pudo cargar la carpeta");
    status.textContent = folderErrorMessage(error, "cargo la carpeta");
  } finally {
    button.disabled = false;
    button.textContent = "Seleccionar carpeta SISO";
  }
}

async function saveConsolidatedIfPossible(directory = state.sisoDirectoryHandle) {
  if (!directory || !state.data.records.length) return false;
  try {
    await writeTextFile(directory, "consolidado_final_vacunaciones_siso.csv", recordsToCsv(state.data.records), "text/csv;charset=utf-8");
    const vaccinesDir = await getDirectory(directory, "Vacunas");
    await writeTextFile(vaccinesDir, "00_consolidado_final_vacunaciones_siso.csv", recordsToCsv(state.data.records), "text/csv;charset=utf-8");
    return true;
  } catch {
    return false;
  }
}

function handleExcelConvertUpload(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  alert(
    `Seleccionaste "${file.name}". Para convertir Excel a CSV sin subir datos a internet, usa el archivo Convertir_Excel_a_CSV.bat incluido en esta carpeta. El navegador no convierte Excel directamente sin librerias externas.`,
  );
}

// Secciones de Vacunaciones: se muestran como botones grandes y cada una se abre por separado.
function closeDetailSection() {
  const module = $("vacunaciones");
  if (!module) return;
  module.classList.remove("detail-open");
  document.querySelectorAll(".detail-panel").forEach((panel) => {
    panel.classList.remove("active");
    panel.style.display = "none";
  });
  document.querySelectorAll(".section-button").forEach((item) => item.classList.remove("active"));
}

function openDetailSection(id) {
  const target = $(id);
  if (!target) return;
  closeDetailSection();
  $("vacunaciones").classList.add("detail-open");
  target.classList.add("active");
  target.style.display = "block";
  document.querySelectorAll(".section-button").forEach((item) => item.classList.toggle("active", item.dataset.detail === id));
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}

function initDetailSections() {
  document.querySelectorAll(".detail-panel").forEach((panel) => {
    const header = panel.querySelector(".panel-header");
    if (!header || header.querySelector(".detail-back")) return;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "detail-back";
    back.innerHTML = "&larr; Secciones";
    back.addEventListener("click", () => {
      closeDetailSection();
      document.querySelector(".section-index")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    header.prepend(back);
  });
  closeDetailSection();

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail]");
    if (!button) return;
    if (button.classList.contains("active")) {
      closeDetailSection();
      return;
    }
    openDetailSection(button.dataset.detail);
  });
}

function renderFenixFilters() {
  const select = $("fenixYearFilter");
  if (!select) return;
  const current = select.value;
  fillSelect(select, uniqueOptions(state.fenixRecords, "anio"), "Todos los años");
  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function applyFenixFilters() {
  const year = $("fenixYearFilter").value;
  const query = normalizeText($("fenixSearchInput").value);
  state.fenixFiltered = state.fenixRecords.filter((record) => {
    if (year && record.anio !== year) return false;
    if (!query) return true;
    return [record.nombre, record.dpi, record.codigo, record.archivo, record.ruta_relativa].some((value) => normalizeText(value).includes(query));
  });
  renderFenixTable();
  const loaded = state.fenixRecords.length;
  const visible = state.fenixFiltered.length;
  $("fenixSummary").textContent = loaded
    ? `${formatNumber(visible)} de ${formatNumber(loaded)} resultados FENIX visibles segun filtros.`
    : "Sin indice FENIX cargado. Selecciona la carpeta RESPALDO DE SISO para leer FENIX/fenix_indice_resultados_siso.csv.";
}

function renderFenixTable() {
  const tbody = $("fenixTableBody");
  if (!tbody) return;
  if (!state.fenixFiltered.length) {
    tbody.innerHTML = `<tr><td colspan="6">Sin resultados para mostrar.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.fenixFiltered
    .slice(0, 500)
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(record.anio)}</td>
          <td>${escapeHtml(record.dpi || record.codigo || "Sin dato")}</td>
          <td><strong>${escapeHtml(record.nombre)}</strong></td>
          <td>${escapeHtml(record.archivo)}</td>
          <td><span class="status ${record.estado_parseo === "ok" ? "" : "review"}">${escapeHtml(record.estado_parseo || "ok")}</span></td>
          <td><button class="ghost-button small-button" data-open-fenix="${record.id}">Abrir PDF</button></td>
        </tr>`,
    )
    .join("");
}

function renderFenix() {
  renderHomeStats();
  renderFenixFilters();
  applyFenixFilters();
}

async function getFileFromRelativePath(directory, relativePath) {
  const parts = String(relativePath || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length) throw new Error("Ruta de PDF vacia.");
  let current = directory;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part);
  }
  const fileHandle = await current.getFileHandle(parts.at(-1));
  return fileHandle.getFile();
}

async function openFenixPdf(recordId) {
  const record = state.fenixRecords.find((item) => String(item.id) === String(recordId));
  if (!record) return;
  if (!state.sisoDirectoryHandle) {
    alert("Primero selecciona la carpeta RESPALDO DE SISO para que el navegador pueda abrir el PDF desde OneDrive.");
    return;
  }
  try {
    const file = await getFileFromRelativePath(state.sisoDirectoryHandle, `FENIX/${record.ruta_relativa}`);
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    alert(`No se pudo abrir el PDF. Verifica que exista en FENIX/${record.ruta_relativa}. ${error.message}`);
  }
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function excelHtml(title, headers, rows) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          ${row
            .map(
              (cell) => `
                <td>${String(cell ?? "")
                  .split("\n")
                  .map((part) => escapeHtml(part))
                  .join("<br>")}</td>
              `,
            )
            .join("")}
        </tr>
      `,
    )
    .join("");
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #1f2a28; }
          h1 { font-size: 18px; margin: 0 0 12px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #f7faf9; color: #566a6a; font-weight: 700; text-align: left; }
          th, td { border: 1px solid #d7e1de; padding: 9px 10px; vertical-align: top; mso-number-format: "\\@"; }
          td { font-size: 11pt; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

async function writeTextFile(directory, filename, content, type = "text/plain;charset=utf-8") {
  const file = await directory.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(new Blob([content], { type }));
  await writable.close();
}

async function moveToIncorporated(root, items) {
  let moved = 0;
  try {
    const newDir = await getDirectory(root, NEW_JORNADAS_FOLDER);
    const doneDir = await getDirectory(newDir, "Incorporadas");
    for (const item of items) {
      const name = item.path.split("/").pop();
      const parts = item.path.split("/");
      if (parts.length !== 2) continue; // solo archivos directos de Jornadas_nuevas
      await writeTextFile(doneDir, name, await item.file.text(), "text/csv;charset=utf-8");
      await newDir.removeEntry(name);
      moved += 1;
    }
  } catch (error) {
    console.warn("No se pudieron mover jornadas incorporadas.", error);
  }
  return moved;
}

// Usa la carpeta SISO ya elegida en esta sesion; solo pregunta si aun no se eligio o si no hay permiso.
async function getSisoDirectory() {
  const current = state.sisoDirectoryHandle || (await idbGet("sisoFolder"));
  if (current && current.queryPermission) {
    try {
      let permission = await current.queryPermission({ mode: "readwrite" });
      if (permission === "prompt") permission = await current.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        state.sisoDirectoryHandle = current;
        return current;
      }
    } catch (error) {
      // Si falla, se vuelve a pedir la carpeta.
    }
  }
  const directory = await window.showDirectoryPicker({ mode: "readwrite" });
  state.sisoDirectoryHandle = directory;
  idbSet("sisoFolder", directory);
  return directory;
}

// Mensaje claro cuando falla el acceso a la carpeta.
function folderErrorMessage(error, action) {
  if (error.name === "AbortError") return `No se eligio ninguna carpeta, por eso no se ${action}. Vuelve a intentarlo y presiona "Seleccionar carpeta" con RESPALDO DE SISO.`;
  if (error.name === "NotAllowedError") return `El navegador no dio permiso para editar la carpeta, por eso no se ${action}. Vuelve a intentarlo y acepta "Editar archivos".`;
  return `No se ${action}. ${error.message}`;
}

// Deja solo los N archivos mas recientes del historial.
async function pruneHistory(directory, keep) {
  const files = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === "file") files.push({ name, modified: (await handle.getFile()).lastModified });
  }
  files.sort((a, b) => b.modified - a.modified);
  for (const old of files.slice(keep)) {
    await directory.removeEntry(old.name);
  }
}

async function getDirectory(parent, name) {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeExcelFile(directory, filename, title, headers, rows) {
  await writeTextFile(directory, filename, excelHtml(title, headers, rows), "application/vnd.ms-excel;charset=utf-8");
}

async function backupToFolder() {
  const status = $("backupStatus");
  const payload = buildBackupPayload();
  const filename = backupFileName();
  if (!window.showDirectoryPicker) {
    downloadJson(payload, filename);
    status.textContent = "Tu navegador no permitio seleccionar carpeta. Se descargo el respaldo JSON.";
    return;
  }
  try {
    const dir = await getSisoDirectory();
    const file = await dir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    status.textContent = `Respaldo guardado: ${filename}`;
  } catch (error) {
    status.textContent = folderErrorMessage(error, "guardo el respaldo tecnico");
  }
}

async function readableBackupToFolder() {
  const status = $("backupStatus");
  if (!window.showDirectoryPicker) {
    status.textContent = "Tu navegador no permitio seleccionar carpetas. Usa Edge o Chrome actualizado para guardar respaldo legible en OneDrive.";
    return;
  }

  try {
    const root = await getSisoDirectory();
    showBusy("Guardando respaldo...");
    const stamp = backupStamp();
    const vaccinesRoot = await getDirectory(root, "Vacunas");
    await saveConsolidatedIfPossible(root);
    const historyDir = await getDirectory(vaccinesRoot, HISTORY_FOLDER);
    await writeTextFile(
      historyDir,
      `consolidado_vacunaciones_siso_${stamp}.csv`,
      recordsToCsv(state.data.records),
      "text/csv;charset=utf-8",
    );
    await pruneHistory(historyDir, HISTORY_KEEP);
    const groupedVaccines = state.data.records.reduce((acc, record) => {
      const year = String(record.anio || "Sin año");
      const vaccine = record.vacuna || "Sin vacuna";
      const key = `${year}||${vaccine}`;
      acc[key] = acc[key] || [];
      acc[key].push(record);
      return acc;
    }, {});

    for (const [key, records] of Object.entries(groupedVaccines)) {
      const [year, vaccine] = key.split("||");
      const yearDir = await getDirectory(vaccinesRoot, safeFolderName(year));
      const vaccineDir = await getDirectory(yearDir, safeFolderName(vaccine));
      await writeExcelFile(
        vaccineDir,
        `${safeFolderName(vaccine)}_${safeFolderName(year)}.xls`,
        `${vaccine} ${year}`,
        ["Código", "Nombre", "Vacuna", "Dosis", "Fecha / Año", "Estado", "Gerencia / Área", "Tipo", "Fuente"],
        records.map((record) => [
          record.codigo || "S/C",
          record.nombre || record.nombre_listado || "Sin nombre",
          record.vacuna,
          hepBDoseFor(record, hepBHistories()),
          recordWhen(record),
          record.estado,
          record.gerencia || record.area || "Sin dato",
          record.tipo_persona || record.tipo || "",
          record.fuente,
        ]),
      );
    }

    const headcountDir = await getDirectory(root, "Head_Count");
    await writeExcelFile(
      headcountDir,
      "Head_Count_Actual.xls",
      "Head Count actual",
      ["Código", "Nombre", "Gerencia", "CECO", "Tipo"],
      state.data.headcount.map((person) => [person.codigo, person.nombre, person.gerencia || "Sin dato", person.ceco || "", "Colaborador activo"]),
    );

    const sourcesDir = await getDirectory(root, "Fuentes");
    await writeExcelFile(
      sourcesDir,
      "Fuentes_Incluidas.xls",
      "Fuentes incluidas",
      ["Año", "Jornada", "Estado", "Nota"],
      state.data.sources.map((source) => [source.anio, source.jornada, source.estado, source.nota]),
    );

    const excludedDir = await getDirectory(root, "Pendientes_de_validar");
    await writeExcelFile(
      excludedDir,
      "Pendientes_de_validar.xls",
      "Pendientes de validar",
      ["Año", "Jornada", "Motivo"],
      state.data.excluded.map((source) => [source.anio, source.jornada, source.motivo]),
    );

    await writeTextFile(
      root,
      "LEEME_RESPALDO_SISO.txt",
      [
        "RESPALDO LEGIBLE SISO",
        `Fecha de respaldo: ${stamp}`,
        "",
        "Estructura:",
        "- consolidado_final_vacunaciones_siso.csv: archivo maestro para cargar todas las jornadas en SISO.",
        "- Vacunas / 00_consolidado_final_vacunaciones_siso.csv: copia del consolidado maestro.",
        `- Vacunas / Historial: copias fechadas del consolidado (solo se conservan las ultimas ${HISTORY_KEEP}).`,
        "- Jornadas_nuevas: aqui se guarda cada jornada nueva en CSV; SISO la agrega al consolidado al seleccionar la carpeta.",
        "- Vacunas / Año / Vacuna: archivos Excel por jornada o grupo de vacuna.",
        "- Head_Count: base laboral actual usada para cruces.",
        "- Fuentes: archivos incluidos en indicadores.",
        "- Pendientes_de_validar: archivos que no entran aun a indicadores oficiales.",
        "",
        "Cada respaldo reemplaza estos archivos por la version actual; ya no se crean copias repetidas.",
      ].join("\n"),
    );

    status.textContent = `Respaldo legible guardado con fecha ${stamp}. Tambien se actualizo consolidado_final_vacunaciones_siso.csv.`;
    hideBusy(true, "Respaldo guardado");
  } catch (error) {
    if (error.name !== "AbortError") hideBusy(false, "No se guardó el respaldo");
    status.textContent = folderErrorMessage(error, "guardo el respaldo legible");
  }
}

function downloadExcel(filename, title, headers, rows) {
  const html = excelHtml(title, headers, rows);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportRecordsExcel() {
  const histories = hepBHistories();
  downloadExcel(
    "personas_y_jornadas_filtradas.xls",
    "Personas y jornadas",
    ["Código", "Nombre", "Vacuna", "Dosis", "Fecha / Año", "Estado", "Gerencia / Área", "Tipo"],
    state.filtered.map((record) => [
      record.codigo || "S/C",
      `${record.nombre || record.nombre_listado || "Sin nombre"}\n${record.fuente || ""}`,
      record.vacuna,
      hepBDoseFor(record, histories),
      recordWhen(record),
      record.estado,
      record.gerencia || record.area || "Sin dato",
      record.tipo_persona || record.tipo || "",
    ]),
  );
}

function exportComparisonExcel() {
  if (!state.comparison.length) {
    alert("Selecciona año y vacuna para generar el comparativo contra Head Count.");
    return;
  }
  downloadExcel(
    "comparativo_headcount.xls",
    "Comparativo contra Head Count actual",
    ["Código", "Nombre", "Gerencia", "Vacuna/Año", "Estado comparativo", "Detalle"],
    state.comparison.map((row) => [row.codigo, row.nombre, row.gerencia, `${row.vacuna} ${row.anio}`, row.estado, row.detalle]),
  );
}

function exportMatrixExcel() {
  downloadExcel(
    "matriz_por_colaborador.xls",
    "Matriz por colaborador",
    ["Código", "Nombre", "Gerencia", "VHA 2023", "Influenza 2025", "Sarampion 2026"],
    matrixRows().map((row) => [row.codigo, row.nombre, row.gerencia, row.vha, row.influenza, row.sarampion]),
  );
}

function exportSourcesExcel() {
  downloadExcel(
    "fuentes_incluidas.xls",
    "Fuentes incluidas",
    ["Año", "Jornada", "Estado", "Nota"],
    state.data.sources.map((source) => [source.anio, source.jornada, source.estado, source.nota]),
  );
}

function exportExcludedExcel() {
  downloadExcel(
    "pendiente_de_validar.xls",
    "Pendiente de validar",
    ["Año", "Jornada", "Motivo"],
    state.data.excluded.map((source) => [source.anio, source.jornada, source.motivo]),
  );
}

async function init() {
  initLogin();
  state.data = await loadInitialData();
  loadSavedHeadcount();
  loadSavedVaccinations();
  if (IT_DEMO_MODE) {
    state.data = { ...EMPTY_DATA, generated_at: "Vista demostrativa para IT: sin datos cargados" };
    state.headcountSource = "Head Count cargado: sin archivo seleccionado";
    $("headcountInfo").textContent = "Head Count cargado: sin archivo seleccionado";
    $("vaccineUploadInfo").textContent = "0 registros agregados. Selecciona una jornada CSV o una carpeta SISO.";
    $("folderImportInfo").textContent =
      "Carpeta no seleccionada. La informacion se carga solo desde OneDrive/SharePoint empresarial.";
  }
  state.filtered = state.data.records;
  $("generatedAt").textContent = "";

  renderKpis();
  populateFilters();
  renderSources();
  applyFilters();
  renderFenix();

  // Solo botones y enlaces de navegacion (nunca el body ni contenedores).
  document.querySelectorAll("button[data-module], a[data-module]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      switchModule(item.dataset.module);
    });
  });

  initDetailSections();
  $("mobileLogout").addEventListener("click", () => $("logoutButton").click());
  $("folderBannerBtn").addEventListener("click", folderBannerClick);
  $("hepbList").addEventListener("change", (event) => {
    const select = event.target.closest("[data-merge-from]");
    if (!select || !select.value) return;
    const target = select.value;
    select.value = "";
    mergePeople(select.dataset.mergeFrom, target);
  });

  ["yearFilter", "vaccineFilter", "statusFilter", "managementFilter", "searchInput"].forEach((id) => {
    $(id).addEventListener("input", applyFilters);
  });

  $("resetFilters").addEventListener("click", () => {
    ["yearFilter", "vaccineFilter", "statusFilter", "managementFilter"].forEach((id) => ($(id).value = ""));
    $("searchInput").value = "";
    applyFilters();
  });

  $("downloadRecordsExcel").addEventListener("click", exportRecordsExcel);
  $("downloadComparisonExcel").addEventListener("click", exportComparisonExcel);
  $("downloadMatrixExcel").addEventListener("click", exportMatrixExcel);
  $("downloadSourcesExcel").addEventListener("click", exportSourcesExcel);
  $("downloadExcludedExcel").addEventListener("click", exportExcludedExcel);
  $("downloadBackup").addEventListener("click", () => downloadJson(buildBackupPayload(), backupFileName()));
  $("backupToFolder").addEventListener("click", backupToFolder);
  $("readableBackupToFolder").addEventListener("click", readableBackupToFolder);
  $("headcountUpload").addEventListener("change", handleHeadcountUpload);
  $("downloadHeadcountTemplate").addEventListener("click", downloadHeadcountTemplate);
  $("vaccineUpload").addEventListener("change", handleVaccineUpload);
  $("downloadVaccineTemplate").addEventListener("click", downloadVaccineTemplate);
  $("clearVaccineData").addEventListener("click", clearVaccineData);
  $("loadSisoFolder").addEventListener("click", loadSisoFolder);
  $("loadFenixFolder").addEventListener("click", loadSisoFolder);
  ["fenixYearFilter", "fenixSearchInput"].forEach((id) => {
    $(id).addEventListener("input", applyFenixFilters);
  });
  $("hepbList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-fenix]");
    if (button) openFenixPdf(button.dataset.openFenix);
    const toggle = event.target.closest("[data-edit-person]");
    const cancel = event.target.closest("[data-edit-cancel]");
    const save = event.target.closest("[data-edit-save]");
    const formFor = (key) => [...document.querySelectorAll("[data-edit-form]")].find((f) => f.dataset.editForm === key);
    if (toggle) {
      const form = formFor(toggle.dataset.editPerson);
      form.hidden = !form.hidden;
      toggle.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("[data-edit-name]").focus();
    }
    if (cancel) {
      formFor(cancel.dataset.editCancel).hidden = true;
      document.querySelector(`[data-edit-person="${CSS.escape(cancel.dataset.editCancel)}"]`).hidden = false;
    }
    if (save) {
      const form = formFor(save.dataset.editSave);
      renamePerson(save.dataset.editSave, form.querySelector("[data-edit-name]").value, form.querySelector("[data-edit-code]").value);
    }
  });
  // Al escribir un codigo del Head Count, se propone su nombre oficial.
  $("hepbList").addEventListener("input", (event) => {
    const codeInput = event.target.closest("[data-edit-code]");
    if (!codeInput) return;
    const code = normalizeCode(codeInput.value).replace(/^0+/, "");
    const match = code && state.data.headcount.find((p) => normalizeCode(p.codigo).replace(/^0+/, "") === code);
    if (match) codeInput.closest("[data-edit-form]").querySelector("[data-edit-name]").value = match.nombre;
  });
  $("fenixTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-fenix]");
    if (!button) return;
    openFenixPdf(button.dataset.openFenix);
  });
  $("excelConvertUpload").addEventListener("change", handleExcelConvertUpload);
  state.initDone = true;
  if (state.user) tryRestoreFolder();
}

async function loadInitialData() {
  const candidates = ["./data.local.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      return {
        ...EMPTY_DATA,
        ...data,
        headcount: Array.isArray(data.headcount) ? data.headcount : [],
        records: Array.isArray(data.records) ? data.records : [],
        sources: Array.isArray(data.sources) ? data.sources : [],
        excluded: Array.isArray(data.excluded) ? data.excluded : [],
      };
    } catch (error) {
      // En modo local seguro puede no existir ningun archivo de datos inicial.
    }
  }
  return { ...EMPTY_DATA };
}

init();
