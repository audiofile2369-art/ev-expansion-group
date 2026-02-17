const state = {
    groups: [{ id: "general", name: "General", color: "#10b981" }],
    landmarks: [],
    files: [],
    filter: "all",
    userEmail: null
};

const API_BASE = "/api/portal";
const AUTH_TOKEN_KEY = "evxPortalToken";
const AUTH_EMAIL_KEY = "evxPortalEmail";

let map;
let markersLayer;
let isMapReady = false;
let overlayLayer;
let overlayLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
    wireLogin();
    wireUploads();
    wireGroups();
    wireLandmarkControls();
    wireOverlayToggle();
    hydrateSession();
});

function setAuth(email, token) {
    state.userEmail = email;
    localStorage.setItem(AUTH_EMAIL_KEY, email);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuth() {
    state.userEmail = null;
    localStorage.removeItem(AUTH_EMAIL_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
}

function wireLogin() {
    const loginForm = document.getElementById("portal-login-form");
    const registerForm = document.getElementById("portal-register-form");
    const logoutBtn = document.getElementById("logout-btn");
    const emailInput = document.getElementById("portal-email");
    const passwordInput = document.getElementById("portal-password");
    const errorBox = document.getElementById("login-error");
    const registerError = document.getElementById("register-error");
    const showRegister = document.getElementById("show-register");
    const showLogin = document.getElementById("show-login");

    const toggleForms = (showRegisterForm) => {
        loginForm.classList.toggle("hidden", showRegisterForm);
        registerForm.classList.toggle("hidden", !showRegisterForm);
        errorBox.textContent = "";
        registerError.textContent = "";
    };

    showRegister?.addEventListener("click", () => toggleForms(true));
    showLogin?.addEventListener("click", () => toggleForms(false));

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        try {
            const res = await apiRequest("login", "POST", { email, password });
            setAuth(email, res.token);
            errorBox.textContent = "";
            await enterPortal();
        } catch (err) {
            errorBox.textContent = err.message || "Login failed.";
        }
    });

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("register-email").value.trim().toLowerCase();
        const password = document.getElementById("register-password").value;
        const confirm = document.getElementById("register-confirm").value;
        if (password !== confirm) {
            registerError.textContent = "Passwords do not match.";
            return;
        }
        try {
            const res = await apiRequest("register", "POST", { email, password });
            setAuth(email, res.token);
            registerError.textContent = "";
            await enterPortal();
        } catch (err) {
            registerError.textContent = err.message || "Registration failed.";
        }
    });

    logoutBtn.addEventListener("click", () => {
        clearAuth();
        document.getElementById("portal-app").classList.add("hidden");
        document.getElementById("login-screen").classList.remove("hidden");
    });
}

function hydrateSession() {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const storedEmail = localStorage.getItem(AUTH_EMAIL_KEY);
    if (!storedToken || !storedEmail) return;
    state.userEmail = storedEmail;
    enterPortal().catch(() => clearAuth());
}

async function enterPortal() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("portal-app").classList.remove("hidden");
    initMap();
    const overlayToggle = document.getElementById("overlay-toggle");
    if (overlayToggle?.checked) {
        loadOverlay(true);
    }
    await loadLandmarksFromServer();
    refreshUI();
}

function initMap() {
    if (isMapReady) return;
    map = L.map("portal-map").setView([31.9686, -99.9018], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    isMapReady = true;
}

function wireUploads() {
    const fileInput = document.getElementById("file-upload");
    const dropzone = document.querySelector(".upload-dropzone");
    const singleForm = document.getElementById("single-landmark-form");
    const singleGroupSelect = document.getElementById("single-group");

    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        if (fileInput.files?.length) {
            Array.from(fileInput.files).forEach(readFile);
            fileInput.value = "";
        }
    });

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "#10b981";
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "#cbd5e1";
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "#cbd5e1";
        const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.match(/\.(kml|csv)$/i));
        files.forEach(readFile);
    });

    singleForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("single-name").value.trim();
        const lat = parseFloat(document.getElementById("single-lat").value);
        const lng = parseFloat(document.getElementById("single-lng").value);
        const group = singleGroupSelect.value || "general";
        if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return;
        const landmark = { name, lat, lng, group, source: "Manual" };
        addLandmarks([landmark], "Manual Entry");
        singleForm.reset();
    });
}

function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const ext = file.name.split(".").pop().toLowerCase();
            const content = reader.result;
            let parsed = [];

            if (ext === "kml") {
                parsed = parseKML(content);
            } else if (ext === "csv") {
                parsed = parseCSV(content);
            }

            if (!parsed.length) {
                alert(`No landmarks found in ${file.name}.`);
                return;
            }

            addLandmarks(parsed, file.name);
            state.files.unshift({
                name: file.name,
                type: ext.toUpperCase(),
                count: parsed.length,
                addedAt: new Date().toLocaleString()
            });
            refreshUI();
        } catch (err) {
            console.error(err);
            alert(`Unable to process ${file.name}. Please confirm the format.`);
        }
    };
    reader.readAsText(file);
}

function getAuthHeaders() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(action, method, payload) {
    const res = await fetch(`${API_BASE}?action=${action}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders()
        },
        body: method === "GET" ? undefined : JSON.stringify(payload || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

function parseKML(content) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(content, "text/xml");
    const placemarks = Array.from(xml.getElementsByTagName("Placemark"));
    const landmarks = [];

    placemarks.forEach((pm, idx) => {
        const name = pm.getElementsByTagName("name")[0]?.textContent?.trim() || `Landmark ${idx + 1}`;
        const coordText = pm.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (!coordText) return;
        const firstCoord = coordText.split(/\s+/).find(Boolean);
        if (!firstCoord) return;
        const [lngStr, latStr] = firstCoord.split(",");
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        landmarks.push({ name, lat, lng, group: "general", source: "KML" });
    });

    return landmarks;
}

async function loadLandmarksFromServer() {
    if (!state.userEmail || !localStorage.getItem(AUTH_TOKEN_KEY)) {
        state.landmarks = [];
        return;
    }
    try {
        const data = await apiRequest("landmarks", "GET");
        state.landmarks = data.landmarks || [];
        state.landmarks.forEach(lm => {
            if (!state.groups.some(g => g.id === lm.group)) {
                createGroup(lm.group, randomColor());
            }
        });
    } catch (err) {
        console.error("Load landmarks failed", err);
    }
}

async function persistLandmarks() {
    if (!state.userEmail || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    try {
        await apiRequest("landmarks", "POST", { landmarks: state.landmarks });
    } catch (err) {
        console.error("Save landmarks failed", err);
    }
}

async function loadOverlay(addToMap = true) {
    if (overlayLoaded && overlayLayer) {
        if (addToMap) overlayLayer.addTo(map);
        return;
    }
    try {
        const resp = await fetch("../txdot_need_areas_polygons.kml");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const shapes = parseKMLPolygons(text);
        if (!shapes.length) return;
        overlayLayer = L.layerGroup(shapes);
        overlayLoaded = true;
        if (addToMap) overlayLayer.addTo(map);
    } catch (err) {
        console.error("Overlay load failed", err);
    }
}

function parseKMLPolygons(content) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(content, "text/xml");
    const polygons = Array.from(xml.getElementsByTagName("Polygon"));
    const shapes = [];

    polygons.forEach(poly => {
        const coordsNode = poly.getElementsByTagName("coordinates")[0];
        if (!coordsNode) return;
        const coordsText = coordsNode.textContent?.trim();
        if (!coordsText) return;
        const ring = coordsText.split(/\s+/).map(pair => {
            const [lngStr, latStr] = pair.split(",");
            const lat = parseFloat(latStr);
            const lng = parseFloat(lngStr);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
            return [lat, lng];
        }).filter(Boolean);
        if (ring.length < 3) return;
        const placemark = poly.closest("Placemark");
        const name = placemark?.getElementsByTagName("name")[0]?.textContent?.trim() || "Need area";
        const shape = L.polygon(ring, {
            color: "#f59e0b",
            weight: 2,
            fillOpacity: 0.15
        }).bindPopup(name);
        shapes.push(shape);
    });

    return shapes;
}

function parseCSV(content) {
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = parseCSVLine(lines.shift()).map(h => h.toLowerCase());

    const nameIdx = headers.findIndex(h => ["name", "title", "label"].includes(h));
    const latIdx = headers.findIndex(h => ["lat", "latitude"].includes(h));
    const lngIdx = headers.findIndex(h => ["lng", "lon", "long", "longitude"].includes(h));
    const groupIdx = headers.findIndex(h => ["group", "category"].includes(h));

    const landmarks = [];
    lines.forEach((line, idx) => {
        const cols = parseCSVLine(line);
        const name = (cols[nameIdx] || `Landmark ${idx + 1}`).trim();
        const lat = parseFloat(cols[latIdx]);
        const lng = parseFloat(cols[lngIdx]);
        const group = (cols[groupIdx] || "general").trim().toLowerCase() || "general";
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        if (!state.groups.some(g => g.id === slugify(group))) {
            createGroup(group, randomColor());
        }
        landmarks.push({ name, lat, lng, group: slugify(group), source: "CSV" });
    });

    return landmarks;
}

function parseCSVLine(line) {
    return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(val => val.replace(/^"|"$/g, "").trim());
}

function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "general";
}

function addLandmarks(landmarks, sourceLabel) {
    const withIds = landmarks.map((lm, idx) => ({
        id: `${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
        name: lm.name,
        lat: lm.lat,
        lng: lm.lng,
        group: slugify(lm.group || "general"),
        source: lm.source || sourceLabel
    }));
    state.landmarks.push(...withIds);
    refreshUI();
    fitBounds();
    persistLandmarks();
}

function wireGroups() {
    const groupForm = document.getElementById("group-form");
    const groupName = document.getElementById("group-name");
    const groupColor = document.getElementById("group-color");
    const groupFilter = document.getElementById("group-filter");

    groupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = groupName.value.trim();
        const color = groupColor.value;
        if (!name) return;
        createGroup(name, color);
        groupName.value = "";
    });

    groupFilter.addEventListener("change", () => {
        state.filter = groupFilter.value;
        refreshUI();
    });
}

function createGroup(name, color) {
    const id = slugify(name);
    if (state.groups.some(g => g.id === id)) return;
    state.groups.push({ id, name: name || "Group", color: color || randomColor() });
    refreshUI();
}

function wireLandmarkControls() {
    document.getElementById("clear-landmarks").addEventListener("click", () => {
        if (confirm("Clear all landmarks from this session?")) {
            state.landmarks = [];
            refreshUI();
            persistLandmarks();
        }
    });

    document.getElementById("fit-bounds").addEventListener("click", fitBounds);
}

function wireOverlayToggle() {
    const toggle = document.getElementById("overlay-toggle");
    if (!toggle) return;
    toggle.addEventListener("change", async () => {
        if (!overlayLoaded) {
            await loadOverlay(toggle.checked);
            return;
        }
        if (overlayLayer) {
            if (toggle.checked) {
                overlayLayer.addTo(map);
            } else {
                map.removeLayer(overlayLayer);
            }
        }
    });
}

function refreshUI() {
    renderGroupSelects();
    renderGroups();
    renderFiles();
    renderLandmarks();
}

function renderGroupSelects() {
    const singleGroup = document.getElementById("single-group");
    const filterSelect = document.getElementById("group-filter");
    singleGroup.innerHTML = "";
    filterSelect.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All groups";
    filterSelect.appendChild(allOpt);

    state.groups.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        singleGroup.appendChild(opt.cloneNode(true));
        filterSelect.appendChild(opt);
    });

    filterSelect.value = state.filter || "all";
}

function renderGroups() {
    const groupList = document.getElementById("group-list");
    groupList.innerHTML = "";
    const counts = state.landmarks.reduce((acc, lm) => {
        acc[lm.group] = (acc[lm.group] || 0) + 1;
        return acc;
    }, {});

    state.groups.forEach(g => {
        const item = document.createElement("div");
        item.className = "group-item";
        item.innerHTML = `
            <div class="group-meta">
                <span class="color-dot" style="background:${g.color}"></span>
                <div>
                    <div><strong>${g.name}</strong></div>
                    <div class="muted">${counts[g.id] || 0} landmarks</div>
                </div>
            </div>
            <div class="file-meta">
                <span>${g.id}</span>
            </div>
        `;
        groupList.appendChild(item);
    });
}

function renderFiles() {
    const container = document.getElementById("file-history");
    container.innerHTML = "";
    if (!state.files.length) {
        container.innerHTML = `<p class="muted">No uploads yet. Drop a KML or CSV to get started.</p>`;
        return;
    }

    state.files.slice(0, 10).forEach(file => {
        const el = document.createElement("div");
        el.className = "file-item";
        el.innerHTML = `
            <h4>${file.name}</h4>
            <div class="file-meta">
                <span>${file.type}</span>
                <span>${file.count} landmarks</span>
                <span>${file.addedAt}</span>
            </div>
        `;
        container.appendChild(el);
    });
}

function renderLandmarks() {
    if (!isMapReady) return;
    markersLayer.clearLayers();
    const tbody = document.getElementById("landmark-rows");
    tbody.innerHTML = "";

    const visible = state.landmarks.filter(lm => state.filter === "all" || lm.group === state.filter);

    visible.forEach((lm) => {
        const group = state.groups.find(g => g.id === lm.group) || state.groups[0];
        const marker = L.circleMarker([lm.lat, lm.lng], {
            radius: 8,
            color: group?.color || "#0ea5e9",
            fillColor: group?.color || "#0ea5e9",
            fillOpacity: 0.85,
            weight: 2
        }).bindPopup(`<strong>${lm.name}</strong><br>${group?.name || lm.group}<br>${lm.lat.toFixed(4)}, ${lm.lng.toFixed(4)}<br><small>${lm.source}</small>`);
        markersLayer.addLayer(marker);

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${lm.name}</td>
            <td>${renderGroupSelector(lm.group)}</td>
            <td>${lm.lat.toFixed(4)}</td>
            <td>${lm.lng.toFixed(4)}</td>
            <td>${lm.source}</td>
            <td><button class="ghost-btn danger" data-remove="${lm.id}">Remove</button></td>
        `;
        tbody.appendChild(row);

        const selector = row.querySelector("select");
        selector.addEventListener("change", () => {
            lm.group = selector.value;
            refreshUI();
            persistLandmarks();
        });

        row.querySelector("[data-remove]").addEventListener("click", () => {
            state.landmarks = state.landmarks.filter(item => item.id !== lm.id);
            refreshUI();
            persistLandmarks();
        });
    });
}

function renderGroupSelector(selected) {
    return `
        <select>
            ${state.groups.map(g => `<option value="${g.id}" ${g.id === selected ? "selected" : ""}>${g.name}</option>`).join("")}
        </select>
    `;
}

function fitBounds() {
    if (!isMapReady || !state.landmarks.length) {
        map?.setView([31.9686, -99.9018], 5);
        return;
    }
    const latLngs = state.landmarks.map(lm => [lm.lat, lm.lng]);
    map.fitBounds(latLngs, { padding: [20, 20] });
}

function randomColor() {
    const colors = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];
    return colors[Math.floor(Math.random() * colors.length)];
}
