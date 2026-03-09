/**
 * Medical Data Explorer — front-end application.
 *
 * Talks to the FastAPI backend via /api/v1/* endpoints.
 * The nginx reverse-proxy routes /api/* to the API service,
 * so we use relative URLs (no CORS needed).
 */

"use strict";

// ── Configuration ───────────────────────────────────────────────────────
const API_BASE = "/api/v1";

// ── DOM references ──────────────────────────────────────────────────────
const tableSelect = document.getElementById("table-select");
const pageSize = document.getElementById("page-size");
const tableInfo = document.getElementById("table-info");
const infoTotalRows = document.getElementById("info-total-rows");
const infoColumns = document.getElementById("info-columns");
const errorBanner = document.getElementById("error-banner");
const tableContainer = document.getElementById("table-container");
const pagination = document.getElementById("pagination");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const pageIndicator = document.getElementById("page-indicator");

// ── State ───────────────────────────────────────────────────────────────
let currentTable = "";
let currentOffset = 0;
let totalRows = 0;

// ── API helpers ─────────────────────────────────────────────────────────

async function apiFetch(path) {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${response.status}`);
    }
    return response.json();
}

function showError(message) {
    errorBanner.textContent = `Error: ${message}`;
    errorBanner.classList.remove("hidden");
}

function clearError() {
    errorBanner.classList.add("hidden");
}

// ── Load tables ─────────────────────────────────────────────────────────

async function loadTables() {
    try {
        const data = await apiFetch("/tables");
        tableSelect.innerHTML = '<option value="">— Select a table —</option>';

        data.tables.forEach((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            tableSelect.appendChild(option);
        });

        tableSelect.disabled = false;
        clearError();
    } catch (err) {
        showError(`Failed to load tables: ${err.message}`);
    }
}

// ── Load table info ─────────────────────────────────────────────────────

async function loadTableInfo(tableName) {
    try {
        const data = await apiFetch(`/tables/${tableName}`);
        totalRows = data.total_rows;
        infoTotalRows.textContent = `${totalRows.toLocaleString()} rows`;
        infoColumns.textContent = `${data.columns.length} columns`;
        tableInfo.classList.remove("hidden");
        clearError();
    } catch (err) {
        showError(`Failed to load table info: ${err.message}`);
    }
}

// ── Load rows ───────────────────────────────────────────────────────────

async function loadRows() {
    if (!currentTable) return;

    const limit = parseInt(pageSize.value, 10);

    tableContainer.classList.add("loading");

    try {
        const data = await apiFetch(
            `/tables/${currentTable}/rows?limit=${limit}&offset=${currentOffset}`
        );

        totalRows = data.total_rows;
        renderTable(data.rows);
        updatePagination(limit);
        clearError();
    } catch (err) {
        showError(`Failed to load rows: ${err.message}`);
    } finally {
        tableContainer.classList.remove("loading");
    }
}

// ── Render table ────────────────────────────────────────────────────────

function renderTable(rows) {
    if (!rows || rows.length === 0) {
        tableContainer.innerHTML = '<p class="placeholder">No data found</p>';
        return;
    }

    const columns = Object.keys(rows[0]);

    const headerCells = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");

    const bodyRows = rows
        .map((row) => {
            const cells = columns
                .map((col) => `<td title="${escapeHtml(String(row[col] ?? ""))}">${escapeHtml(String(row[col] ?? ""))}</td>`)
                .join("");
            return `<tr>${cells}</tr>`;
        })
        .join("");

    tableContainer.innerHTML = `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

// ── Pagination ──────────────────────────────────────────────────────────

function updatePagination(limit) {
    const currentPage = Math.floor(currentOffset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(totalRows / limit));

    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    btnPrev.disabled = currentOffset === 0;
    btnNext.disabled = currentOffset + limit >= totalRows;
    pagination.classList.remove("hidden");
}

// ── Utilities ───────────────────────────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ── Event listeners ─────────────────────────────────────────────────────

tableSelect.addEventListener("change", async () => {
    currentTable = tableSelect.value;
    currentOffset = 0;

    if (!currentTable) {
        tableContainer.innerHTML = '<p class="placeholder">Select a table to view data</p>';
        tableInfo.classList.add("hidden");
        pagination.classList.add("hidden");
        return;
    }

    await loadTableInfo(currentTable);
    await loadRows();
});

pageSize.addEventListener("change", () => {
    currentOffset = 0;
    loadRows();
});

btnPrev.addEventListener("click", () => {
    const limit = parseInt(pageSize.value, 10);
    currentOffset = Math.max(0, currentOffset - limit);
    loadRows();
});

btnNext.addEventListener("click", () => {
    const limit = parseInt(pageSize.value, 10);
    currentOffset += limit;
    loadRows();
});

// ── Initialise ──────────────────────────────────────────────────────────
loadTables();
