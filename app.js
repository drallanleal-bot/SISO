const state = {
  data: null,
  filtered: [],
  comparison: [],
  user: null,
  headcountSource: "Base inicial del sistema",
};

const $ = (id) => document.getElementById(id);

const users = [
  { username: "DRLEAL", password: "Guate2023*", label: "Dr. Leal", photo: true },
  { username: "CLINICAMEDICA", password: "SANAS123", label: "Clinica Medica", photo: false },
  { username: "ENFERMERIA", password: "SANAS123", label: "Enfermeria", photo: false },
  { username: "JEFESHE", password: "SHE01", label: "Jefe SHE", photo: false },
];

function normalizeUser(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function currentFilters() {
  return {
    year: $("yearFilter").value,
    vaccine: $("vaccineFilter").value,
    status: $("statusFilter").value,
    management: $("managementFilter").value,
    query: $("searchInput").value.trim().toLowerCase(),
  };
}

function switchModule(moduleName) {
  document.querySelectorAll(".module").forEach((module) => {
    module.classList.toggle("active", module.id === moduleName);
  });
  document.querySelectorAll("[data-module]").forEach((item) => {
    item.classList.toggle("active", item.dataset.module === moduleName);
  });
}

function showAppForUser(user) {
  state.user = user;
  document.body.classList.remove("auth-locked");
  document.body.classList.toggle("drleal-session", user.username === "DRLEAL");
  $("activeUserLabel").textContent = `Sesion: ${user.label}`;
  $("brandInitials").textContent = user.username === "DRLEAL" ? "" : "MO";
}

function initLogin() {
  const remembered = localStorage.getItem("siso_remembered_user") || "";
  $("loginUser").value = remembered;
  $("rememberUser").checked = Boolean(remembered);

  $("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = normalizeUser($("loginUser").value);
    const password = $("loginPassword").value;
    const user = users.find((item) => item.username === username && item.password === password);
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
    ["Head Count activo", formatNumber(metrics.populationCount), "Personas activas segun Head Count actual y filtros"],
    ["Cobertura vs Head Count", formatPercent(metrics.coverage), "Vacunados activos divididos dentro del Head Count filtrado"],
    ["Vacunados en listado", formatNumber(metrics.listedVaccinated), "Registros vacunados que aparecen en el listado filtrado"],
    ["Vacunados activos", formatNumber(metrics.activeVaccinated), "Vacunados que cruzan por codigo contra Head Count actual"],
    ["Pendientes oficiales", formatNumber(metrics.officialPending), "Registros marcados como pendiente oficial en la fuente"],
    ["Pendientes HC", formatNumber(metrics.pendingHeadcount), "Activos del Head Count sin registro vacunado para el filtro"],
    ["Activos no listados", formatNumber(metrics.activeNotListed), "Activos que no aparecen en la data filtrada"],
    ["Historico confiable", formatNumber(metrics.reliableRecords), "Registros confiables incluidos despues de aplicar filtros"],
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
  const officialPending = state.filtered.filter((record) => record.estado === "Pendiente oficial").length;
  const pendingHeadcount = Math.max(populationCount - activeVaccinated, 0);
  const activeNotListed = people.filter((person) => !recordCodes.has(String(person.codigo || ""))).length;

  return {
    populationCount,
    coverage,
    listedVaccinated: vaccinatedRecords.length,
    activeVaccinated,
    officialPending,
    pendingHeadcount,
    activeNotListed,
    reliableRecords: state.filtered.length,
  };
}

function renderSummary() {
  const { year, vaccine } = currentFilters();
  const metrics = summaryMetrics();
  const title = [vaccine || "Todas las vacunas", year || "todos los anos"].join(" - ");
  $("summaryHelp").textContent = `${title}: lectura contra ${formatNumber(metrics.populationCount)} personas del Head Count actual.`;

  const pct = Math.max(0, Math.min(metrics.coverage * 100, 100));
  $("coverageDonut").style.setProperty("--pct", `${pct}%`);
  $("coverageDonut").querySelector("span").textContent = `${pct.toFixed(1)}%`;

  const bars = [
    ["Vacunados activos", metrics.activeVaccinated, "Cruzan con Head Count"],
    ["Pendientes HC", metrics.pendingHeadcount, "Activos sin registro vacunado"],
    ["Activos no listados", metrics.activeNotListed, "No aparecen en la data filtrada"],
    ["Pendientes oficiales", metrics.officialPending, "Segun fuente oficial"],
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
  const records = state.data.records;
  fillSelect($("yearFilter"), uniqueOptions(records, "anio"), "Todos los anos");
  fillSelect($("vaccineFilter"), uniqueOptions(records, "vacuna"), "Todas las vacunas");
  fillSelect($("statusFilter"), uniqueOptions(records, "estado"), "Todos los estados");
  fillSelect($("managementFilter"), uniqueOptions([...records, ...state.data.headcount], "gerencia"), "Todas las gerencias");
  $("headcountInfo").textContent = `${state.headcountSource}: ${formatNumber(state.data.headcount.length)} colaboradores activos`;
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
  $("resultCount").textContent = `${formatNumber(state.filtered.length)} registros`;
  $("recordsTable").innerHTML = state.filtered
    .slice(0, 600)
    .map(
      (record) => `
        <tr>
          <td>${record.codigo || "S/C"}</td>
          <td><strong>${record.nombre || record.nombre_listado}</strong><br><span>${record.fuente}</span></td>
          <td>${record.vacuna}</td>
          <td>${record.anio}</td>
          <td><span class="badge ${badgeClass(record.estado)}">${record.estado}</span></td>
          <td>${record.gerencia || record.area || "Sin dato"}</td>
          <td>${record.tipo_persona}</td>
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
      <article class="comparison-card"><strong>Seleccion pendiente</strong><span>Elige ano y vacuna para comparar contra Head Count actual.</span></article>
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
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  return `respaldo_medicina_ocupacional_${stamp}.json`;
}

function backupStamp() {
  return new Date().toISOString().slice(0, 10);
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
  if (codeIndex < 0 || nameIndex < 0) {
    throw new Error("El CSV debe tener columnas de codigo y nombre.");
  }
  return rows
    .slice(1)
    .map((row) => ({
      codigo: String(row[codeIndex] || "").trim(),
      nombre: String(row[nameIndex] || "").trim().toUpperCase(),
      gerencia: String(row[managementIndex] || "").trim().toUpperCase(),
      ceco: String(row[cecoIndex] || "").trim(),
    }))
    .filter((person) => person.codigo && person.nombre);
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

function loadSavedHeadcount() {
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

function initDetailSections() {
  const buttons = document.querySelectorAll("[data-detail]");
  const panels = document.querySelectorAll(".detail-panel");
  panels.forEach((panel) => {
    panel.classList.remove("active");
    panel.style.display = "none";
  });
  document.querySelectorAll(".section-button").forEach((item) => item.classList.remove("active"));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail]");
    if (!button) return;
    document.querySelectorAll(".section-button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".detail-panel").forEach((panel) => {
      const isSelected = panel.id === button.dataset.detail;
      panel.classList.toggle("active", isSelected);
      panel.style.display = isSelected ? "block" : "none";
    });
  });
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
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    const file = await dir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    status.textContent = `Respaldo guardado: ${filename}`;
  } catch (error) {
    status.textContent = `No se guardo en carpeta. ${error.message}`;
  }
}

async function readableBackupToFolder() {
  const status = $("backupStatus");
  if (!window.showDirectoryPicker) {
    status.textContent = "Tu navegador no permitio seleccionar carpetas. Usa Edge o Chrome actualizado para guardar respaldo legible en OneDrive.";
    return;
  }

  try {
    const root = await window.showDirectoryPicker({ mode: "readwrite" });
    const stamp = backupStamp();
    const vaccinesRoot = await getDirectory(root, "Vacunas");
    const groupedVaccines = state.data.records.reduce((acc, record) => {
      const year = String(record.anio || "Sin ano");
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
        `${safeFolderName(vaccine)}_${safeFolderName(year)}_${stamp}.xls`,
        `${vaccine} ${year}`,
        ["Codigo", "Nombre", "Vacuna", "Ano", "Estado", "Gerencia / Area", "Tipo", "Fuente"],
        records.map((record) => [
          record.codigo || "S/C",
          record.nombre || record.nombre_listado || "Sin nombre",
          record.vacuna,
          record.anio,
          record.estado,
          record.gerencia || record.area || "Sin dato",
          record.tipo_persona,
          record.fuente,
        ]),
      );
    }

    const headcountDir = await getDirectory(root, "Head_Count");
    await writeExcelFile(
      headcountDir,
      `Head_Count_Actual_${stamp}.xls`,
      "Head Count actual",
      ["Codigo", "Nombre", "Gerencia", "CECO", "Tipo"],
      state.data.headcount.map((person) => [person.codigo, person.nombre, person.gerencia || "Sin dato", person.ceco || "", "Colaborador activo"]),
    );

    const sourcesDir = await getDirectory(root, "Fuentes");
    await writeExcelFile(
      sourcesDir,
      `Fuentes_Incluidas_${stamp}.xls`,
      "Fuentes incluidas",
      ["Ano", "Jornada", "Estado", "Nota"],
      state.data.sources.map((source) => [source.anio, source.jornada, source.estado, source.nota]),
    );

    const excludedDir = await getDirectory(root, "Pendientes_de_validar");
    await writeExcelFile(
      excludedDir,
      `Pendientes_de_validar_${stamp}.xls`,
      "Pendientes de validar",
      ["Ano", "Jornada", "Motivo"],
      state.data.excluded.map((source) => [source.anio, source.jornada, source.motivo]),
    );

    await writeTextFile(
      root,
      `LEEME_RESPALDO_SISO_${stamp}.txt`,
      [
        "RESPALDO LEGIBLE SISO",
        `Fecha de respaldo: ${stamp}`,
        "",
        "Estructura:",
        "- Vacunas / Ano / Vacuna: archivos Excel por jornada o grupo de vacuna.",
        "- Head_Count: base laboral actual usada para cruces.",
        "- Fuentes: archivos incluidos en indicadores.",
        "- Pendientes_de_validar: archivos que no entran aun a indicadores oficiales.",
        "",
        "Nota: estos archivos son para continuidad operativa. El sistema web usa data.json como respaldo tecnico.",
      ].join("\n"),
    );

    status.textContent = `Respaldo legible guardado en carpetas Excel con fecha ${stamp}.`;
  } catch (error) {
    status.textContent = `No se guardo el respaldo legible. ${error.message}`;
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
  downloadExcel(
    "personas_y_jornadas_filtradas.xls",
    "Personas y jornadas",
    ["Codigo", "Nombre", "Vacuna", "Ano", "Estado", "Gerencia / Area", "Tipo"],
    state.filtered.map((record) => [
      record.codigo || "S/C",
      `${record.nombre || record.nombre_listado || "Sin nombre"}\n${record.fuente || ""}`,
      record.vacuna,
      record.anio,
      record.estado,
      record.gerencia || record.area || "Sin dato",
      record.tipo_persona,
    ]),
  );
}

function exportComparisonExcel() {
  if (!state.comparison.length) {
    alert("Selecciona ano y vacuna para generar el comparativo contra Head Count.");
    return;
  }
  downloadExcel(
    "comparativo_headcount.xls",
    "Comparativo contra Head Count actual",
    ["Codigo", "Nombre", "Gerencia", "Vacuna/Ano", "Estado comparativo", "Detalle"],
    state.comparison.map((row) => [row.codigo, row.nombre, row.gerencia, `${row.vacuna} ${row.anio}`, row.estado, row.detalle]),
  );
}

function exportMatrixExcel() {
  downloadExcel(
    "matriz_por_colaborador.xls",
    "Matriz por colaborador",
    ["Codigo", "Nombre", "Gerencia", "VHA 2023", "Influenza 2025", "Sarampion 2026"],
    matrixRows().map((row) => [row.codigo, row.nombre, row.gerencia, row.vha, row.influenza, row.sarampion]),
  );
}

function exportSourcesExcel() {
  downloadExcel(
    "fuentes_incluidas.xls",
    "Fuentes incluidas",
    ["Ano", "Jornada", "Estado", "Nota"],
    state.data.sources.map((source) => [source.anio, source.jornada, source.estado, source.nota]),
  );
}

function exportExcludedExcel() {
  downloadExcel(
    "pendiente_de_validar.xls",
    "Pendiente de validar",
    ["Ano", "Jornada", "Motivo"],
    state.data.excluded.map((source) => [source.anio, source.jornada, source.motivo]),
  );
}

async function init() {
  initLogin();
  const response = await fetch("./data.json");
  state.data = await response.json();
  loadSavedHeadcount();
  state.filtered = state.data.records;
  $("generatedAt").textContent = `Datos generados: ${state.data.generated_at}`;

  renderKpis();
  populateFilters();
  renderSources();
  applyFilters();

  document.querySelectorAll("[data-module]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      switchModule(item.dataset.module);
    });
  });

  initDetailSections();

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
}

init();
