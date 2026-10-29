// =====================================================================
// SISO - Registro de atenciones (Clinica Medica y Clinica Dental)
// Mismo contenido que los "FORMATO DE INGRESO" de Excel, pero:
//  - llena solo los datos del colaborador desde el Head Count,
//  - busca diagnosticos CIE-10,
//  - guarda en OneDrive un archivo por clinica, mes y usuario:
//    Atenciones/<año>/<MM Mes año>/<Clinica>_<USUARIO>.csv
// Ningun dato de pacientes se sube a GitHub.
// =====================================================================

const AT_MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const AT_AREAS = [
  "ADMINISTRACIÓN", "ALMACENES", "AUDITORÍA", "BODEGA MATERIA PRIMA Y SUMINISTROS", "BODEGA PRODUCTO TERMINADO", "CALIDAD", "COMPRAS",
  "CONTABILIDAD", "ENTARIMADO/DESENTARIMADO", "EXPORTACIÓN", "FORMUACIÓN BEBIDAS", "FORMULACIÓN ALIMENTOS", "LABORATORIO DE CALIDAD",
  "MANTENIMIENTO", "MERCADEO", "NINGUNO", "PRODUCCCIÓN ALIMENTOS IAK", "PRODUCCIÓN BEBIDAS IAK", "PROVEEDOR", "PROYECTOS", "SANEAMIENTO",
  "SHE", "TALENTO", "VENTAS",
];
const AT_CONSULTA = ["Emergencia", "Primera Consulta", "Recargo (agregado a la agenda)", "Reconsulta (cuadro agudo)", "Seguimiento (cuadro crónico)"];
const AT_SI_NO = ["Sí", "No"];

// Datos del colaborador (iguales en ambas clinicas).
const AT_PERSON_FIELDS = [
  { key: "codigo", label: "Código empleado", type: "text", inputmode: "numeric" },
  { key: "nombre", label: "Nombre", type: "text", required: true, span: 2 },
  { key: "tipo_paciente", label: "Tipo paciente", type: "select", required: true },
  { key: "area", label: "Área o departamento", type: "select", options: AT_AREAS },
  { key: "puesto", label: "Puesto", type: "text" },
  { key: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date" },
  { key: "edad", label: "Edad", type: "number", readonlyAuto: true },
  { key: "genero", label: "Género", type: "select", options: ["Masculino", "Femenino"] },
];

const AT_CONFIG = {
  medica: {
    id: "medica",
    container: "atMedica",
    title: "Clínica Médica",
    fileName: "Clinica_Medica",
    tiposPaciente: ["Fijos", "Temporales", "Externos", "Familiares", "Pre-Empleos"],
    providers: ["Dr. Javier Amenabar", "Dr. Allan Leal", "Médico Externo"],
    providerByUser: { DRLEAL: "Dr. Allan Leal", CLINICAMEDICAIAK: "Dr. Javier Amenabar", CLINICAMEDICACUBREIAK: "Médico Externo" },
    extraPerson: [],
    sections: [
      {
        title: "Atención",
        fields: [
          { key: "brinda", label: "¿Quién brinda la atención?", type: "select", required: true },
          { key: "recibe", label: "¿Recibe la atención?", type: "select", options: AT_SI_NO, required: true, default: "Sí" },
          { key: "tipo_consulta", label: "Tipo de consulta", type: "select", options: AT_CONSULTA, required: true },
        ],
      },
      {
        title: "Diagnóstico y tratamiento",
        fields: [
          { key: "dx_principal", label: "Diagnóstico principal (CIE-10)", type: "cie", span: 3, requiredIf: (v) => v.recibe !== "No" },
          { key: "dx_secundarios", label: "Diagnósticos secundarios (CIE-10)", type: "cieMulti", span: 3 },
          { key: "cronico", label: "Paciente crónico", type: "select", options: ["NO", "SI"], default: "NO" },
          { key: "tipo_cronica", label: "Tipo de enfermedad crónica (CIE-10)", type: "cie", span: 2, showIf: (v) => v.cronico === "SI" },
          { key: "medicamentos", label: "Medicamentos prescritos", type: "textarea", span: 2 },
          { key: "receta", label: "Correlativo de receta", type: "text" },
        ],
      },
      {
        title: "Suspensión y referencia",
        fields: [
          { key: "suspension", label: "Amerita suspensión", type: "select", options: ["No", "24 horas", "48 horas", "Período diferente"], default: "No" },
          { key: "dias_suspension", label: "Días de suspensión", type: "number", showIf: (v) => v.suspension && v.suspension !== "No" },
          {
            key: "referencia",
            label: "Referencia o seguimiento por especialista",
            type: "select",
            span: 2,
            options: ["No", "Emergencia del IGSS Enfermedad Común", "Emergencia del IGSS Traumatología", "Especialidades del IGSS Periférica", "Otra Emergencia/Entidad Privada (a solicitud del pte)"],
            default: "No",
          },
          {
            key: "especialidad",
            label: "Especialidad de referencia en el IGSS",
            type: "select",
            options: ["Enfermedad Común", "Cirugía General", "Ginecología", "Medicina Interna", "Odontología/Cirugía Maxilofacial", "Traumatología"],
            showIf: (v) => v.referencia && v.referencia !== "No",
          },
          { key: "comentarios", label: "Comentarios adicionales", type: "textarea", span: 3 },
        ],
      },
    ],
    exportColumns: [
      ["FECHA", "fecha"], ["CÓDIGO EMPLEADO", "codigo"], ["NOMBRE", "nombre"], ["TIPO PACIENTE", "tipo_paciente"], ["ÁREA O DEPARTAMENTO", "area"],
      ["PUESTO", "puesto"], ["FECHA DE NACIMIENTO", "fecha_nacimiento"], ["EDAD", "edad"], ["GÉNERO", "genero"],
      ["¿QUIÉN BRINDA LA ATENCIÓN?", "brinda"], ["¿RECIBE LA ATENCIÓN?", "recibe"], ["TIPO DE CONSULTA", "tipo_consulta"],
      ["DIAGNÓSTICO PRINCIPAL", "dx_principal"], ["CIE-10 PRINCIPAL", "dx_principal_codigo"], ["DIAGNÓSTICOS SECUNDARIOS", "dx_secundarios"],
      ["PACIENTE CRÓNICO", "cronico"], ["TIPO DE ENFERMEDAD CRÓNICA", "tipo_cronica"], ["MEDICAMENTOS PRESCRITOS", "medicamentos"],
      ["CORRELATIVO DE RECETA MÉDICA", "receta"], ["AMERITA SUSPENSIÓN", "suspension"], ["DÍAS DE SUSPENSIÓN", "dias_suspension"],
      ["AMERITA REFERENCIA O SEGUIMIENTO POR ESPECIALISTA", "referencia"], ["ESPECIALIDAD DE REFERENCIA  EN EL IGSS", "especialidad"],
      ["COMENTARIOS ADICIONALES (si considera)", "comentarios"], ["REGISTRADO POR", "usuario"],
    ],
    listColumns: [["Fecha", "fecha"], ["Colaborador", "nombre"], ["Tipo", "tipo_consulta"], ["Diagnóstico", "dx_principal"], ["Susp.", "dias_suspension"], ["Atiende", "brinda"]],
  },
  dental: {
    id: "dental",
    container: "atDental",
    title: "Clínica Odontológica",
    fileName: "Clinica_Dental",
    tiposPaciente: ["Fijos", "Temporales", "Pensionados", "Externos", "Familiares", "Pre-Empleos"],
    providers: ["Dra. Damaris De León", "Dra./Dr. de cubre"],
    providerByUser: { ODONTOLOGIAIAK: "Dra. Damaris De León", ODONTOLOGIACUBREIAK: "Dra./Dr. de cubre" },
    extraPerson: [],
    sections: [
      {
        title: "Cita",
        fields: [
          { key: "hora", label: "Hora asignada", type: "time" },
          { key: "brinda", label: "¿Quién brinda la atención?", type: "select", required: true },
          { key: "recibe", label: "¿Recibe la atención?", type: "select", options: AT_SI_NO, required: true, default: "Sí" },
          {
            key: "motivo_cancelacion",
            label: "Motivo de cancelación",
            type: "select",
            options: ["No se presentó", "Canceló el paciente", "Reagendado", "Falla de equipo", "Otro"],
            showIf: (v) => v.recibe === "No",
            requiredIf: (v) => v.recibe === "No",
          },
          { key: "tipo_consulta", label: "Tipo de consulta", type: "select", options: AT_CONSULTA, required: true },
        ],
      },
      {
        title: "Atención",
        fields: [
          {
            key: "motivo_consulta",
            label: "Motivo de consulta",
            type: "suggest",
            span: 2,
            suggestions: [
              "LIMPIEZA DE 6 MESES", "RELLENOS", "DOLOR", "EVALUACION", "EVALUACION Y LIMPIEZA", "EVALUACION RADIOGRAFICA", "CORTES DE CORONA Y PROVISIONAL",
              "TOMA DE IMPRESIÓN", "TECNICAS DE CEPILLADO", "PRIMERA VISITA DENTAL", "SE LE CAYO UN PUENTE", "SE LE CAYO UN RELLENO", "AJUSTE DE CORONA",
              "RECONSTRUCCION", "SENSIBILIDAD", "EXTRACCION", "AJUSTE DE PROVISIONAL", "AJUSTE DE PROTESIS FLEXIBLE", "EXODONCIA", "CEMENTACION DE CORONA",
              "RECEMENTACION DE PROVISIONAL", "CORONA",
            ],
            requiredIf: (v) => v.recibe !== "No",
          },
          { key: "dias_suspension", label: "Días de suspensión", type: "number" },
          {
            key: "referencia",
            label: "Lugar de referencia",
            type: "select",
            span: 2,
            options: ["No", "Otra Emergencia/Entidad Privada (a solicitud del pte)", "Emergencia del IGSS"],
            default: "No",
          },
          { key: "comentarios", label: "Comentarios adicionales (tratamiento realizado, pieza, etc.)", type: "textarea", span: 3 },
        ],
      },
    ],
    exportColumns: [
      ["FECHA", "fecha"], ["HORA ASIGNADA", "hora"], ["CÓDIGO EMPLEADO", "codigo"], ["NOMBRE", "nombre"], ["TIPO PACIENTE", "tipo_paciente"],
      ["ÁREA O DEPARTAMENTO", "area"], ["PUESTO", "puesto"], ["FECHA DE NACIMIENTO", "fecha_nacimiento"], ["EDAD", "edad"], ["GÉNERO", "genero"],
      ["¿QUIÉN BRINDA LA ATENCIÓN?", "brinda"], ["¿RECIBE LA ATENCIÓN?", "recibe"], ["MOTIVO DE CANCELACIÓN", "motivo_cancelacion"],
      ["TIPO DE CONSULTA", "tipo_consulta"], ["MOTIVO DE CONSULTA", "motivo_consulta"], ["DÍAS DE SUSPENSIÓN", "dias_suspension"],
      ["LUGAR DE REFERENCIA", "referencia"], ["COMENTARIOS ADICIONALES (si considera)", "comentarios"], ["REGISTRADO POR", "usuario"],
    ],
    listColumns: [["Fecha", "fecha"], ["Hora", "hora"], ["Colaborador", "nombre"], ["Tipo", "tipo_consulta"], ["Motivo", "motivo_consulta"], ["Atiende", "brinda"]],
  },
};

const AT_BASE_COLUMNS = ["id", "clinica", "usuario", "registrado", "actualizado", "fecha"];

const atState = {
  records: [], // todas las atenciones leidas de la carpeta + las nuevas
  editing: { medica: null, dental: null },
  month: { medica: "", dental: "" },
  cieReady: false,
};

// ---------- Utilidades ----------
function atToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function atNowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${atToday()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function atNewId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function atMonthKey(fecha) {
  return String(fecha || "").slice(0, 7);
}

function atMonthLabel(key) {
  const [y, m] = key.split("-");
  return `${AT_MONTHS[Number(m) - 1] || ""} ${y}`;
}

function atAge(dob, onDate) {
  const birth = normalizeDate(dob);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return "";
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = (onDate || atToday()).split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 && age < 120 ? String(age) : "";
}

function atAllFields(cfg) {
  return [...AT_PERSON_FIELDS, ...cfg.extraPerson, ...cfg.sections.flatMap((s) => s.fields)];
}

function atColumns(cfg) {
  const cols = [...AT_BASE_COLUMNS];
  atAllFields(cfg).forEach((f) => {
    if (!cols.includes(f.key)) cols.push(f.key);
    if ((f.type === "cie" || f.type === "cieMulti") && !cols.includes(`${f.key}_codigo`)) cols.push(`${f.key}_codigo`);
  });
  return cols;
}

function atPersonKey(r) {
  const code = normalizeCode(r.codigo).replace(/^0+/, "");
  return code ? `c:${code}` : `n:${normalizeText(r.nombre).replace(/\s+/g, " ")}`;
}

function atCanEdit(record) {
  const user = state.user?.username;
  return user && (user === "DRLEAL" || record.usuario === user);
}

function atFilePath(cfg, record) {
  const [y, m] = atMonthKey(record.fecha).split("-");
  return { year: y, folder: `${m} ${AT_MONTHS[Number(m) - 1]} ${y}`, file: `${cfg.fileName}_${record.usuario}.csv` };
}

// ---------- CIE-10 (se carga solo al abrir una clinica) ----------
function atLoadCie() {
  if (window.CIE10 || atState.cieLoading) return atState.cieLoading || Promise.resolve();
  atState.cieLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "./cie10.js?v=1";
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  return atState.cieLoading;
}

function atCieSearch(query, cfg) {
  const list = window.CIE10 || [];
  const q = normalizeText(query).trim();
  if (!q) {
    // Sin texto: los diagnosticos mas usados en esta clinica.
    const counts = new Map();
    atState.records
      .filter((r) => r.clinica === cfg.id && r.dx_principal_codigo)
      .forEach((r) => counts.set(r.dx_principal_codigo, (counts.get(r.dx_principal_codigo) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([code]) => list.find((c) => c[0] === code))
      .filter(Boolean);
  }
  const code = q.replace(/\s+/g, "").toUpperCase();
  if (/^[a-z]\d/i.test(code)) {
    const plain = code.replace(".", "");
    return list.filter((c) => c[0].replace(".", "").startsWith(plain)).slice(0, 15);
  }
  const words = q.split(/\s+/).filter(Boolean);
  const used = new Map();
  atState.records.forEach((r) => r.dx_principal_codigo && used.set(r.dx_principal_codigo, (used.get(r.dx_principal_codigo) || 0) + 1));
  // Orden: primero los que EMPIEZAN con lo escrito, luego palabras que empiezan asi, luego los mas usados y mas cortos.
  const rank = (c) => {
    const text = normalizeText(c[1]);
    if (text.startsWith(q)) return 0;
    if (text.split(/[\s,(]+/).some((word) => word.startsWith(words[0]))) return 1;
    return 2;
  };
  return list
    .filter((c) => {
      const text = normalizeText(c[1]);
      return words.every((w) => text.includes(w));
    })
    .map((c) => ({ c, r: rank(c), u: used.get(c[0]) || 0 }))
    .sort((a, b) => a.r - b.r || b.u - a.u || a.c[1].length - b.c[1].length)
    .slice(0, 15)
    .map((x) => x.c);
}

// ---------- Autocompletado sencillo ----------
function atAttachAutocomplete(input, source, onPick) {
  const box = document.createElement("div");
  box.className = "at-suggest";
  box.hidden = true;
  input.parentElement.appendChild(box);
  let items = [];
  let active = -1;
  const close = () => {
    box.hidden = true;
    active = -1;
  };
  const render = () => {
    items = source(input.value) || [];
    if (!items.length) {
      close();
      return;
    }
    box.innerHTML = items
      .map((it, i) => `<button type="button" class="${i === active ? "active" : ""}" data-i="${i}"><b>${escapeHtml(it.label)}</b>${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ""}</button>`)
      .join("");
    box.hidden = false;
  };
  input.addEventListener("input", () => {
    active = -1;
    render();
  });
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") active = Math.min(active + 1, items.length - 1);
    else if (e.key === "ArrowUp") active = Math.max(active - 1, 0);
    else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      onPick(items[active]);
      close();
      return;
    } else if (e.key === "Escape") return close();
    else return;
    e.preventDefault();
    render();
  });
  box.addEventListener("mousedown", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    e.preventDefault();
    onPick(items[Number(b.dataset.i)]);
    close();
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

// ---------- Busqueda de colaborador ----------
function atPeopleSource(query) {
  const q = normalizeText(query).trim();
  if (q.length < 2) return [];
  const results = [];
  const seen = new Set();
  const add = (p, origen) => {
    const key = atPersonKey(p);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ label: p.nombre, sub: `${p.codigo || "S/C"} · ${origen}`, person: p, origen });
  };
  (state.data?.headcount || []).forEach((p) => {
    if (results.length < 12 && normalizeText(`${p.codigo} ${p.nombre}`).includes(q)) add(p, p.gerencia || "Head Count");
  });
  // Familiares, externos o personas que ya se atendieron y no estan en el Head Count.
  atState.records.forEach((r) => {
    if (results.length < 15 && normalizeText(`${r.codigo} ${r.nombre}`).includes(q)) add(r, `${r.tipo_paciente || "Atención previa"}`);
  });
  return results;
}

function atLastRecord(cfg, person, excludeId) {
  const key = atPersonKey(person);
  return atState.records
    .filter((r) => r.clinica === cfg.id && r.id !== excludeId && atPersonKey(r) === key)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
}

// ---------- Formulario ----------
function atFieldHtml(cfg, f) {
  const id = `at_${cfg.id}_${f.key}`;
  const span = f.span ? ` style="grid-column: span ${f.span}"` : "";
  const req = f.required ? " *" : "";
  let control = "";
  if (f.type === "select") {
    const options = f.key === "tipo_paciente" ? cfg.tiposPaciente : f.key === "brinda" ? cfg.providers : f.options;
    control = `<select id="${id}" data-at-field="${f.key}"><option value="">Elegir...</option>${options.map((o) => `<option>${escapeHtml(o)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") {
    control = `<textarea id="${id}" data-at-field="${f.key}" rows="2"></textarea>`;
  } else if (f.type === "cie") {
    control = `<div class="at-ac"><input id="${id}" data-at-field="${f.key}" data-at-cie placeholder="Escribe diagnóstico o código (ej. faringitis, J02)" autocomplete="off" /></div>`;
  } else if (f.type === "cieMulti") {
    control = `<div class="at-ac"><input id="${id}_buscar" data-at-cie-multi="${f.key}" placeholder="Agregar diagnóstico secundario..." autocomplete="off" /></div><div class="at-chips" id="${id}_chips"></div>`;
  } else if (f.type === "suggest") {
    control = `<input id="${id}" data-at-field="${f.key}" list="${id}_list" autocomplete="off" /><datalist id="${id}_list">${f.suggestions.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("")}</datalist>`;
  } else {
    const type = f.type === "number" ? "number" : f.type;
    control = `<input id="${id}" type="${type}" data-at-field="${f.key}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ""} ${f.readonlyAuto ? 'readonly tabindex="-1" placeholder="Automático"' : ""} min="0" />`;
  }
  return `<label class="at-field" data-at-wrap="${f.key}"${span}>${escapeHtml(f.label)}${req}${control}</label>`;
}

function atRender(cfg) {
  const root = $(cfg.container);
  if (!root) return;
  root.innerHTML = `
    <section class="panel at-form-panel" id="${cfg.id}_form">
      <div class="panel-header">
        <div>
          <h3 id="${cfg.id}_formTitle">📝 Nueva atención</h3>
          <p>Escribe el código o nombre y los datos del colaborador se llenan solos desde el Head Count.</p>
        </div>
        <label class="at-date">Fecha<input type="date" id="at_${cfg.id}_fecha" data-at-field="fecha" /></label>
      </div>
      <div class="at-ac at-person-search">
        <input id="${cfg.id}_buscarPersona" placeholder="🔎 Buscar colaborador: código o nombre..." autocomplete="off" />
      </div>
      <p class="at-person-info" id="${cfg.id}_personInfo"></p>
      <h4 class="at-section-title">Colaborador</h4>
      <div class="at-grid">${[...AT_PERSON_FIELDS, ...cfg.extraPerson].map((f) => atFieldHtml(cfg, f)).join("")}</div>
      ${cfg.sections.map((s) => `<h4 class="at-section-title">${escapeHtml(s.title)}</h4><div class="at-grid">${s.fields.map((f) => atFieldHtml(cfg, f)).join("")}</div>`).join("")}
      <div class="at-actions">
        <button class="primary-button" id="${cfg.id}_save">💾 Guardar atención</button>
        <button class="ghost-button" id="${cfg.id}_clear">Limpiar</button>
        <small id="${cfg.id}_formMsg"></small>
      </div>
    </section>

    <section class="panel at-list-panel">
      <div class="panel-header">
        <div>
          <h3>📋 Atenciones del mes</h3>
          <p id="${cfg.id}_summary"></p>
        </div>
        <div class="at-list-tools">
          <select id="${cfg.id}_month"></select>
          <button class="ghost-button" id="${cfg.id}_refresh" title="Leer otra vez la carpeta para ver lo registrado por otros usuarios">🔄 Actualizar</button>
          <button class="primary-button" id="${cfg.id}_export">📊 Exportar Excel del mes</button>
        </div>
      </div>
      <input class="at-filter" id="${cfg.id}_filter" type="search" placeholder="Filtrar por nombre, código, diagnóstico..." />
      <div id="${cfg.id}_list"></div>
    </section>`;

  // Colaborador
  atAttachAutocomplete($(`${cfg.id}_buscarPersona`), atPeopleSource, (item) => {
    atFillPerson(cfg, item.person, item.origen);
    $(`${cfg.id}_buscarPersona`).value = "";
  });
  const codeInput = atInput(cfg, "codigo");
  codeInput.addEventListener("input", () => {
    delete codeInput.dataset.filled;
    atOnCodeTyped(cfg);
  });
  codeInput.addEventListener("change", () => atOnCodeTyped(cfg));
  // CIE-10
  root.querySelectorAll("[data-at-cie]").forEach((input) => {
    atAttachAutocomplete(
      input,
      (q) => atCieSearch(q, cfg).map((c) => ({ label: c[1], sub: c[0], cie: c })),
      (item) => {
        input.value = item.cie[1];
        input.dataset.code = item.cie[0];
        atUpdateVisibility(cfg);
      },
    );
    input.addEventListener("input", () => delete input.dataset.code);
  });
  root.querySelectorAll("[data-at-cie-multi]").forEach((input) => {
    const key = input.dataset.atCieMulti;
    atAttachAutocomplete(
      input,
      (q) => atCieSearch(q, cfg).map((c) => ({ label: c[1], sub: c[0], cie: c })),
      (item) => {
        const chips = atGetMulti(cfg, key);
        if (!chips.some((c) => c[0] === item.cie[0])) chips.push(item.cie);
        atSetMulti(cfg, key, chips);
        input.value = "";
      },
    );
  });
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-at-chip-remove]");
    if (chip) {
      const [key, code] = chip.dataset.atChipRemove.split("|");
      atSetMulti(cfg, key, atGetMulti(cfg, key).filter((c) => c[0] !== code));
    }
  });
  // Reglas automaticas
  root.addEventListener("change", (e) => {
    const key = e.target.dataset?.atField;
    if (key === "fecha_nacimiento" || key === "fecha") atSetValue(cfg, "edad", atAge(atGetValue(cfg, "fecha_nacimiento"), atGetValue(cfg, "fecha")));
    if (key === "suspension") {
      const v = atGetValue(cfg, "suspension");
      if (v === "24 horas") atSetValue(cfg, "dias_suspension", "1");
      if (v === "48 horas") atSetValue(cfg, "dias_suspension", "2");
      if (v === "No") atSetValue(cfg, "dias_suspension", "");
    }
    atUpdateVisibility(cfg);
  });
  $(`${cfg.id}_save`).addEventListener("click", () => atSave(cfg));
  $(`${cfg.id}_clear`).addEventListener("click", () => atClearForm(cfg));
  $(`${cfg.id}_month`).addEventListener("change", (e) => {
    atState.month[cfg.id] = e.target.value;
    atRenderList(cfg);
  });
  $(`${cfg.id}_filter`).addEventListener("input", () => atRenderList(cfg));
  $(`${cfg.id}_export`).addEventListener("click", () => atExport(cfg));
  $(`${cfg.id}_refresh`).addEventListener("click", atRefreshFromFolder);
  $(`${cfg.id}_list`).addEventListener("click", (e) => {
    const edit = e.target.closest("[data-at-edit]");
    const del = e.target.closest("[data-at-delete]");
    if (edit) atLoadForEdit(cfg, edit.dataset.atEdit);
    if (del) atDelete(cfg, del.dataset.atDelete);
  });
  atClearForm(cfg);
  atRenderList(cfg);
}

function atInput(cfg, key) {
  return $(`at_${cfg.id}_${key}`);
}

function atGetValue(cfg, key) {
  const el = atInput(cfg, key);
  return el ? String(el.value || "").trim() : "";
}

function atSetValue(cfg, key, value) {
  const el = atInput(cfg, key);
  if (!el) return;
  if (el.tagName === "SELECT" && value && ![...el.options].some((o) => o.value === value)) {
    el.insertAdjacentHTML("beforeend", `<option>${escapeHtml(value)}</option>`);
  }
  el.value = value ?? "";
}

function atGetMulti(cfg, key) {
  try {
    return JSON.parse($(`at_${cfg.id}_${key}_chips`).dataset.items || "[]");
  } catch {
    return [];
  }
}

function atSetMulti(cfg, key, items) {
  const box = $(`at_${cfg.id}_${key}_chips`);
  box.dataset.items = JSON.stringify(items);
  box.innerHTML = items
    .map((c) => `<span class="at-chip">${escapeHtml(c[0])} · ${escapeHtml(c[1])}<button type="button" data-at-chip-remove="${key}|${escapeHtml(c[0])}" aria-label="Quitar">×</button></span>`)
    .join("");
}

function atFormValues(cfg) {
  const values = { fecha: atGetValue(cfg, "fecha") };
  atAllFields(cfg).forEach((f) => {
    if (f.type === "cieMulti") {
      const items = atGetMulti(cfg, f.key);
      values[f.key] = items.map((c) => c[1]).join("; ");
      values[`${f.key}_codigo`] = items.map((c) => c[0]).join("; ");
    } else {
      values[f.key] = atGetValue(cfg, f.key);
      if (f.type === "cie") values[`${f.key}_codigo`] = atInput(cfg, f.key)?.dataset.code || "";
    }
  });
  return values;
}

function atUpdateVisibility(cfg) {
  const values = atFormValues(cfg);
  atAllFields(cfg).forEach((f) => {
    if (!f.showIf) return;
    const wrap = document.querySelector(`#${cfg.container} [data-at-wrap="${f.key}"]`);
    if (wrap) wrap.hidden = !f.showIf(values);
  });
}

// ---------- Llenado automatico desde el Head Count ----------
function atHeadcountByCode(code) {
  const c = normalizeCode(code).replace(/^0+/, "");
  if (!c) return null;
  return (state.data?.headcount || []).find((p) => normalizeCode(p.codigo).replace(/^0+/, "") === c) || null;
}

// Area de la ultima atencion de la persona en cualquier clinica.
function atAnyLastArea(p) {
  const key = atPersonKey(p);
  const r = atState.records.filter((x) => x.area && atPersonKey(x) === key).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  return r?.area || "";
}

// Reglas por centro de costo / gerencia del Head Count. Primero manda lo que
// la clinica ya ha elegido antes para ese mismo centro de costo.
const AT_AREA_RULES = [
  [/taller mec|mantenimiento/, "MANTENIMIENTO"],
  [/aseg\.? calidad/, "CALIDAD"],
  [/calidad|laboratorio/, "LABORATORIO DE CALIDAD"],
  [/ehs|\bshe\b/, "SHE"],
  [/exportac/, "EXPORTACIÓN"],
  [/bodega mat|bod\. rep|jefatura bodegas/, "BODEGA MATERIA PRIMA Y SUMINISTROS"],
  [/prod\. term|bod\. pt|cedi|dist|may y sup/, "BODEGA PRODUCTO TERMINADO"],
  [/jarabe|bebi/, "FORMUACIÓN BEBIDAS"],
  [/invest&desarr|invest & desarr/, "FORMULACIÓN ALIMENTOS"],
  [/proyectos|tpm/, "PROYECTOS"],
  [/cip|tetra|linea ?21/, "PRODUCCIÓN BEBIDAS IAK"],
  [/frijol|tomate|mespack|delta pack|salsit|linea|dosimetria|pacto colectivo|gastos indirectos al|control de operacion|produccion|manufactura/, "PRODUCCCIÓN ALIMENTOS IAK"],
  [/compras/, "COMPRAS"],
  [/contab|impuestos|credito|planillas/, "CONTABILIDAD"],
  [/auditoria/, "AUDITORÍA"],
  [/recursos humanos|admin.* rh|talento/, "TALENTO"],
  [/trade|diageo|mercadeo|revenue|intel\. de merc/, "MERCADEO"],
  [/venta|vtas|comerc|telemarketing|region/, "VENTAS"],
  [/merc/, "MERCADEO"],
];

function atAreaFromHeadcount(p) {
  if (!p || !p.ceco) return "";
  const learned = new Map();
  const ceco = p.ceco;
  atState.records.forEach((r) => {
    if (!r.area) return;
    const h = atHeadcountByCode(r.codigo);
    if (h && h.ceco === ceco) learned.set(r.area, (learned.get(r.area) || 0) + 1);
  });
  if (learned.size) return [...learned.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const text = normalizeText(`${p.ceco} ${p.gerencia || ""}`);
  const rule = AT_AREA_RULES.find(([re]) => re.test(text));
  return rule ? rule[1] : "ADMINISTRACIÓN";
}

// Al escribir el codigo directo en "Codigo empleado" se llena todo solo.
function atOnCodeTyped(cfg) {
  const code = atGetValue(cfg, "codigo");
  const msg = $(`${cfg.id}_personInfo`);
  if (!code) return;
  const hc = atHeadcountByCode(code);
  if (hc) {
    if (atInput(cfg, "codigo").dataset.filled === hc.codigo) return;
    atFillPerson(cfg, hc, hc.gerencia || "Head Count");
    atInput(cfg, "codigo").dataset.filled = hc.codigo;
    return;
  }
  const key = atPersonKey({ codigo: code });
  const prev = atState.records.filter((r) => atPersonKey(r) === key).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  if (prev) {
    if (atInput(cfg, "codigo").dataset.filled === code) return;
    atFillPerson(cfg, prev, "Atención previa");
    atInput(cfg, "codigo").dataset.filled = code;
    return;
  }
  if (!(state.data?.headcount || []).length) msg.textContent = "⚠️ El Head Count no está cargado: conecta la carpeta SISO para que los datos se llenen solos.";
  else if (code.length >= 4) msg.textContent = `El código ${code} no está en el Head Count actual. Llena los datos a mano.`;
}

function atFillPerson(cfg, p, origen) {
  atSetValue(cfg, "codigo", normalizeCode(p.codigo));
  atSetValue(cfg, "nombre", p.nombre || "");
  atSetValue(cfg, "puesto", p.puesto || "");
  atSetValue(cfg, "fecha_nacimiento", normalizeDate(p.fecha_nacimiento) || "");
  atSetValue(cfg, "genero", p.sexo || p.genero || "");
  const tipo = p.tipo_paciente || p.tipo_contrato || "";
  if (cfg.tiposPaciente.includes(tipo)) atSetValue(cfg, "tipo_paciente", tipo);
  // Datos de su ultima atencion en esta clinica
  const last = atLastRecord(cfg, p, atState.editing[cfg.id]);
  const hc = atHeadcountByCode(p.codigo);
  const area = p.area || last?.area || atAnyLastArea(p) || atAreaFromHeadcount(hc || p);
  if (area) atSetValue(cfg, "area", area);
  if (!p.puesto && hc?.puesto) atSetValue(cfg, "puesto", hc.puesto);
  if (last) {
    if (!atGetValue(cfg, "tipo_paciente") && last.tipo_paciente) atSetValue(cfg, "tipo_paciente", last.tipo_paciente);
    if (cfg.id === "medica" && last.cronico === "SI" && !atState.editing[cfg.id]) {
      atSetValue(cfg, "cronico", "SI");
      atSetValue(cfg, "tipo_cronica", last.tipo_cronica || "");
      if (last.tipo_cronica_codigo) atInput(cfg, "tipo_cronica").dataset.code = last.tipo_cronica_codigo;
    }
  }
  atSetValue(cfg, "edad", atAge(atGetValue(cfg, "fecha_nacimiento"), atGetValue(cfg, "fecha")));
  const year = atGetValue(cfg, "fecha").slice(0, 4);
  const thisYear = atState.records.filter((r) => r.clinica === cfg.id && r.fecha.startsWith(year) && atPersonKey(r) === atPersonKey(p) && r.id !== atState.editing[cfg.id]);
  if (!thisYear.length && !atState.editing[cfg.id] && !atGetValue(cfg, "tipo_consulta")) atSetValue(cfg, "tipo_consulta", "Primera Consulta");
  const info = [];
  info.push(origen ? `Origen: ${origen}` : "");
  if (hc?.ceco) info.push(hc.ceco);
  info.push(
    last
      ? `Última atención: ${formatDate(last.fecha)}${last.dx_principal ? ` · ${last.dx_principal}` : last.motivo_consulta ? ` · ${last.motivo_consulta}` : ""}`
      : "Primera vez en esta clínica.",
  );
  if (thisYear.length) info.push(`${thisYear.length} atención(es) en ${year}`);
  if (last?.cronico === "SI") info.push(`Crónico: ${last.tipo_cronica || "sí"}`);
  $(`${cfg.id}_personInfo`).textContent = info.filter(Boolean).join(" · ");
  atUpdateVisibility(cfg);
}

function atClearForm(cfg) {
  atState.editing[cfg.id] = null;
  if (atInput(cfg, "codigo")) delete atInput(cfg, "codigo").dataset.filled;
  atAllFields(cfg).forEach((f) => {
    if (f.type === "cieMulti") atSetMulti(cfg, f.key, []);
    else {
      atSetValue(cfg, f.key, f.default || "");
      const el = atInput(cfg, f.key);
      if (el) delete el.dataset.code;
    }
  });
  atSetValue(cfg, "fecha", atToday());
  const provider = cfg.providerByUser[state.user?.username];
  if (provider) atSetValue(cfg, "brinda", provider);
  $(`${cfg.id}_personInfo`).textContent = "";
  $(`${cfg.id}_formTitle`).textContent = "📝 Nueva atención";
  $(`${cfg.id}_save`).textContent = "💾 Guardar atención";
  $(`${cfg.id}_formMsg`).textContent = "";
  atUpdateVisibility(cfg);
}

function atLoadForEdit(cfg, id) {
  const record = atState.records.find((r) => r.id === id);
  if (!record) return;
  atClearForm(cfg);
  atState.editing[cfg.id] = id;
  atSetValue(cfg, "fecha", record.fecha);
  atAllFields(cfg).forEach((f) => {
    if (f.type === "cieMulti") {
      const names = String(record[f.key] || "").split(";").map((s) => s.trim()).filter(Boolean);
      const codes = String(record[`${f.key}_codigo`] || "").split(";").map((s) => s.trim());
      atSetMulti(cfg, f.key, names.map((n, i) => [codes[i] || "", n]));
    } else {
      atSetValue(cfg, f.key, record[f.key] || "");
      if (f.type === "cie" && record[`${f.key}_codigo`]) atInput(cfg, f.key).dataset.code = record[`${f.key}_codigo`];
    }
  });
  $(`${cfg.id}_formTitle`).textContent = `✏️ Editando atención de ${record.nombre}`;
  $(`${cfg.id}_save`).textContent = "💾 Guardar cambios";
  $(`${cfg.id}_personInfo`).textContent = `Registrada por ${record.usuario} el ${record.registrado || ""}`;
  atUpdateVisibility(cfg);
  $(`${cfg.id}_form`).scrollIntoView({ block: "start", behavior: "smooth" });
}

// ---------- Guardar ----------
async function atWriteFiles(cfg, keys) {
  const root = await getSisoDirectory();
  const atRoot = await getDirectory(root, "Atenciones");
  const columns = atColumns(cfg);
  for (const k of keys) {
    const [year, folder, file, usuario, month] = k.split("|");
    const rows = atState.records.filter((r) => r.clinica === cfg.id && r.usuario === usuario && atMonthKey(r.fecha) === month);
    const dir = await getDirectory(await getDirectory(atRoot, year), folder);
    if (!rows.length) {
      try {
        await dir.removeEntry(file);
      } catch {
        // no existia
      }
      continue;
    }
    rows.sort((a, b) => `${a.fecha} ${a.hora || ""} ${a.registrado}`.localeCompare(`${b.fecha} ${b.hora || ""} ${b.registrado}`));
    const csv = `﻿${[columns, ...rows.map((r) => columns.map((c) => r[c] ?? ""))].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
    await writeTextFile(dir, file, csv, "text/csv;charset=utf-8");
  }
}

function atFileKey(cfg, record) {
  const p = atFilePath(cfg, record);
  return `${p.year}|${p.folder}|${p.file}|${record.usuario}|${atMonthKey(record.fecha)}`;
}

async function atSave(cfg) {
  const msg = $(`${cfg.id}_formMsg`);
  const values = atFormValues(cfg);
  // Validaciones
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.fecha)) return (msg.textContent = "Falta la fecha.");
  if (!values.nombre) return (msg.textContent = "Falta el nombre del colaborador.");
  const missing = atAllFields(cfg).filter((f) => {
    const visible = !f.showIf || f.showIf(values);
    const required = f.required || (f.requiredIf && f.requiredIf(values));
    return visible && required && !values[f.key];
  });
  if (missing.length) return (msg.textContent = `Falta: ${missing.map((f) => f.label).join(", ")}.`);
  // Campos ocultos no se guardan
  atAllFields(cfg).forEach((f) => {
    if (f.showIf && !f.showIf(values)) {
      values[f.key] = "";
      if (f.type === "cie") values[`${f.key}_codigo`] = "";
    }
  });
  values.nombre = values.nombre.toUpperCase().replace(/\s+/g, " ");
  values.codigo = normalizeCode(values.codigo);

  const editingId = atState.editing[cfg.id];
  const before = editingId ? atState.records.find((r) => r.id === editingId) : null;
  if (before && !atCanEdit(before)) return (msg.textContent = "Solo quien la registró (o DRLEAL) puede modificar esta atención.");
  const record = before
    ? { ...before, ...values, actualizado: atNowStamp() }
    : { id: atNewId(), clinica: cfg.id, usuario: state.user?.username || "SIN_USUARIO", registrado: atNowStamp(), actualizado: "", ...values };
  const keys = new Set([atFileKey(cfg, record)]);
  if (before) keys.add(atFileKey(cfg, before));
  atState.records = [...atState.records.filter((r) => r.id !== record.id), record];
  showBusy("Guardando atención...");
  try {
    await atWriteFiles(cfg, keys);
    hideBusy(true, `Atención de ${record.nombre} guardada`);
    atState.month[cfg.id] = atMonthKey(record.fecha);
    atClearForm(cfg);
    atRenderList(cfg);
    $(`${cfg.id}_buscarPersona`).focus();
  } catch (error) {
    // Si no se pudo escribir, se deshace para no mostrar algo que no quedo guardado.
    atState.records = [...atState.records.filter((r) => r.id !== record.id), ...(before ? [before] : [])];
    hideBusy(false, "No se guardó la atención");
    msg.textContent = folderErrorMessage(error, "guardo la atencion");
  }
}

async function atDelete(cfg, id) {
  const record = atState.records.find((r) => r.id === id);
  if (!record || !atCanEdit(record)) return;
  if (!window.confirm(`¿Quitar la atención de ${record.nombre} del ${formatDate(record.fecha)}?`)) return;
  atState.records = atState.records.filter((r) => r.id !== id);
  try {
    await atWriteFiles(cfg, new Set([atFileKey(cfg, record)]));
    hideBusy(true, "Atención quitada");
  } catch (error) {
    atState.records.push(record);
    hideBusy(false, "No se pudo quitar");
  }
  atRenderList(cfg);
}

function atHomeStats() {
  const month = atMonthKey(atToday());
  [["medica", "homeMedStat"], ["dental", "homeDenStat"]].forEach(([id, el]) => {
    if (!$(el)) return;
    const n = atState.records.filter((r) => r.clinica === id && atMonthKey(r.fecha) === month).length;
    $(el).textContent = n ? `${formatNumber(n)} atenciones en ${AT_MONTHS[Number(month.slice(5)) - 1].toLowerCase()}` : "Registro de atenciones";
  });
}

// ---------- Lista del mes ----------
function atRenderList(cfg) {
  atHomeStats();
  const box = $(`${cfg.id}_list`);
  if (!box) return;
  const all = atState.records.filter((r) => r.clinica === cfg.id);
  const months = [...new Set([atMonthKey(atToday()), ...all.map((r) => atMonthKey(r.fecha))])].filter(Boolean).sort().reverse();
  const month = atState.month[cfg.id] || months[0];
  atState.month[cfg.id] = month;
  $(`${cfg.id}_month`).innerHTML = months.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${atMonthLabel(m)}</option>`).join("");
  const q = normalizeText($(`${cfg.id}_filter`).value || "");
  const rows = all
    .filter((r) => atMonthKey(r.fecha) === month)
    .filter((r) => !q || normalizeText(Object.values(r).join(" ")).includes(q))
    .sort((a, b) => `${b.fecha} ${b.hora || ""} ${b.registrado}`.localeCompare(`${a.fecha} ${a.hora || ""} ${a.registrado}`));
  const monthRows = all.filter((r) => atMonthKey(r.fecha) === month);
  const atendidos = monthRows.filter((r) => r.recibe !== "No").length;
  const noAsistio = monthRows.length - atendidos;
  const primeras = monthRows.filter((r) => r.tipo_consulta === "Primera Consulta").length;
  const usuarios = [...new Set(monthRows.map((r) => r.usuario))];
  $(`${cfg.id}_summary`).textContent = `${atMonthLabel(month)}: ${formatNumber(monthRows.length)} registros · ${formatNumber(atendidos)} atendidos · ${formatNumber(noAsistio)} no recibieron atención · ${formatNumber(primeras)} primeras consultas${usuarios.length ? ` · registrado por ${usuarios.join(", ")}` : ""}`;
  if (!rows.length) {
    box.innerHTML = `<p class="muted-line">${monthRows.length ? "Nada coincide con el filtro." : "Todavía no hay atenciones registradas este mes."}</p>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap at-table"><table>
    <thead><tr>${cfg.listColumns.map(([h]) => `<th>${h}</th>`).join("")}<th>Recibe</th><th></th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr class="${r.recibe === "No" ? "at-no" : ""}">
          ${cfg.listColumns
            .map(([, k]) =>
              k === "nombre"
                ? `<td><strong>${escapeHtml(r.nombre)}</strong><small>${escapeHtml(r.codigo || "S/C")} · ${escapeHtml(r.tipo_paciente || "")}</small></td>`
                : k === "fecha"
                  ? `<td>${escapeHtml(formatDate(r.fecha))}</td>`
                  : `<td>${escapeHtml(r[k] || "")}${k === "dx_principal" && r.dx_principal_codigo ? `<small>${escapeHtml(r.dx_principal_codigo)}</small>` : ""}</td>`,
            )
            .join("")}
          <td>${r.recibe === "No" ? `<span class="badge missing">No${r.motivo_cancelacion ? ` · ${escapeHtml(r.motivo_cancelacion)}` : ""}</span>` : '<span class="badge">Sí</span>'}</td>
          <td class="at-row-actions">${
            atCanEdit(r)
              ? `<button class="ghost-button" data-at-edit="${r.id}">Editar</button><button class="ghost-button danger" data-at-delete="${r.id}">Quitar</button>`
              : `<small>${escapeHtml(r.usuario)}</small>`
          }</td>
        </tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function atExport(cfg) {
  const month = atState.month[cfg.id];
  const rows = atState.records
    .filter((r) => r.clinica === cfg.id && atMonthKey(r.fecha) === month)
    .sort((a, b) => `${a.fecha} ${a.hora || ""} ${a.registrado}`.localeCompare(`${b.fecha} ${b.hora || ""} ${b.registrado}`));
  downloadExcel(
    `${cfg.fileName}_atenciones_${month}.xls`,
    `${cfg.title} - Atenciones ${atMonthLabel(month)}`,
    ["NO.", ...cfg.exportColumns.map(([h]) => h)],
    rows.map((r, i) => [i + 1, ...cfg.exportColumns.map(([, k]) => (k === "fecha" || k === "fecha_nacimiento" ? formatDate(r[k]) : r[k] ?? ""))]),
  );
}

// ---------- Carga desde la carpeta SISO ----------
function atIsPath(path) {
  return normalizeText(path).replaceAll("\\", "/").startsWith("atenciones/");
}

async function atLoadFromCsvFiles(csvFiles) {
  const loaded = [];
  for (const item of csvFiles.filter((f) => atIsPath(f.path))) {
    const rows = parseCsv(await item.file.text());
    if (rows.length < 2) continue;
    const headers = rows[0].map((h) => String(h).trim());
    rows.slice(1).forEach((row) => {
      const r = Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "").trim()]));
      if (r.id && r.clinica && r.fecha) loaded.push(r);
    });
  }
  atState.records = loaded;
  Object.values(AT_CONFIG).forEach((cfg) => atRenderList(cfg));
}

(window.sisoFolderHooks = window.sisoFolderHooks || []).push(atLoadFromCsvFiles);

async function atRefreshFromFolder() {
  try {
    const root = await getSisoDirectory();
    showBusy("Actualizando atenciones...");
    const files = [];
    try {
      const atRoot = await root.getDirectoryHandle("Atenciones");
      files.push(...(await collectCsvFiles(atRoot, "Atenciones")));
    } catch {
      // aun no hay carpeta Atenciones
    }
    await atLoadFromCsvFiles(files);
    hideBusy(true, "Atenciones actualizadas");
  } catch (error) {
    hideBusy(false, "No se pudo leer la carpeta");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  Object.values(AT_CONFIG).forEach((cfg) => atRender(cfg));
  // El catalogo CIE-10 se descarga al abrir cualquiera de las clinicas.
  document.querySelectorAll('[data-module="medica"], [data-module="odontologia"]').forEach((el) =>
    el.addEventListener("click", () => {
      atLoadCie();
      const userChanged = atState.lastUser !== state.user?.username;
      atState.lastUser = state.user?.username;
      Object.values(AT_CONFIG).forEach((cfg) => {
        // Si cambio el usuario se limpia todo; si no, se conserva lo que estaba a medio escribir.
        if (userChanged || (!atState.editing[cfg.id] && !atGetValue(cfg, "nombre"))) atClearForm(cfg);
        atRenderList(cfg); // botones Editar/Quitar segun el usuario actual
      });
    }),
  );
});
