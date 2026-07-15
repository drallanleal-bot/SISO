const state = {
  data: null,
  filtered: [],
  comparison: [],
  user: null,
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
  const summary = state.data.summary;
  const kpis = [
    ["Head Count activo", formatNumber(summary.headcount_activo), "Base laboral actual"],
    ["Cobertura Sarampion", formatPercent(summary.cobertura_sarampion), "563 de 704 activos"],
    ["Vacunados en listado", formatNumber(summary.sarampion_listado_vacunados), "Constancias oficiales"],
    ["Vacunados activos", formatNumber(summary.sarampion_activos_vacunados), "Cruzan con Head Count"],
    ["Pendientes oficiales", formatNumber(summary.sarampion_pendientes_oficiales), "Dato del listado nuevo"],
    ["Pendientes en HC", formatNumber(summary.sarampion_pendientes_en_hc), "Activos actuales"],
    ["Activos no listados", formatNumber(summary.sarampion_activos_no_listados), "Excepcion de cruce"],
    ["Historico confiable", formatNumber(summary.historico_confiable), "VHA 2023 + Influenza 2025"],
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

function populateFilters() {
  const records = state.data.records;
  fillSelect($("yearFilter"), uniqueOptions(records, "anio"), "Todos los anos");
  fillSelect($("vaccineFilter"), uniqueOptions(records, "vacuna"), "Todas las vacunas");
  fillSelect($("statusFilter"), uniqueOptions(records, "estado"), "Todos los estados");
  fillSelect($("managementFilter"), uniqueOptions(records, "gerencia"), "Todas las gerencias");
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
  const { query, management } = currentFilters();
  let people = state.data.headcount;
  if (management) {
    people = people.filter((person) => person.gerencia === management);
  }
  if (query) {
    people = people.filter((person) => `${person.codigo} ${person.nombre} ${person.gerencia} ${person.ceco}`.toLowerCase().includes(query));
  }
  return people.map((person) => ({
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

  let people = state.data.headcount;
  if (management) people = people.filter((person) => person.gerencia === management);
  if (query) people = people.filter((person) => `${person.codigo} ${person.nombre} ${person.gerencia} ${person.ceco}`.toLowerCase().includes(query));

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

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function downloadExcel(filename, title, headers, rows) {
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
  const html = `
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
}

init();
