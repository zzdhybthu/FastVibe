/**
 * VibeCoding Web Manager - Main Application Logic
 */

(function () {
    "use strict";

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let authToken = localStorage.getItem("vibe_token") || "";
    let currentTab = "tasks";
    let refreshTimer = null;
    const REFRESH_INTERVAL = 30000; // 30 seconds

    const wsClient = new WebSocketClient();

    // -----------------------------------------------------------------------
    // DOM references
    // -----------------------------------------------------------------------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // -----------------------------------------------------------------------
    // Auth-aware fetch wrapper
    // -----------------------------------------------------------------------
    async function apiFetch(path, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }

        const resp = await fetch(path, { ...options, headers });

        if (resp.status === 401) {
            showAuthScreen();
            throw new Error("Unauthorized");
        }

        if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            throw new Error(body.detail || `HTTP ${resp.status}`);
        }

        // DELETE may return 200 with JSON
        return resp.json();
    }

    // -----------------------------------------------------------------------
    // Toast notifications
    // -----------------------------------------------------------------------
    function showToast(message, type = "info") {
        const container = $(".toast-container");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "toastOut 0.3s ease forwards";
            toast.addEventListener("animationend", () => toast.remove());
        }, 3000);
    }

    // -----------------------------------------------------------------------
    // Auth screen
    // -----------------------------------------------------------------------
    function showAuthScreen() {
        $("#auth-screen").style.display = "flex";
        $("#app-main").style.display = "none";
        stopAutoRefresh();
    }

    function hideAuthScreen() {
        $("#auth-screen").style.display = "none";
        $("#app-main").style.display = "flex";
        startAutoRefresh();
    }

    function handleLogin() {
        const input = $("#token-input");
        const token = input.value.trim();
        if (!token) {
            showToast("Please enter a token", "error");
            return;
        }
        authToken = token;
        window.__authToken = token;
        localStorage.setItem("vibe_token", token);
        hideAuthScreen();
        refreshAll();
    }

    // -----------------------------------------------------------------------
    // Tab switching
    // -----------------------------------------------------------------------
    function switchTab(tab) {
        currentTab = tab;

        // Update tab buttons
        $$(".tab-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === tab);
        });

        // Update tab panels
        $$(".tab-panel").forEach((panel) => {
            panel.classList.toggle("active", panel.id === `panel-${tab}`);
        });

        // Refresh relevant data
        if (tab === "tasks") loadTasks();
        else if (tab === "instances") loadInstances();
    }

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------
    async function loadTasks() {
        try {
            const tasks = await apiFetch("/api/tasks");
            renderTasks(tasks);
            updateBadge("tasks", tasks.length);
        } catch (err) {
            if (err.message !== "Unauthorized") {
                console.error("Failed to load tasks:", err);
            }
        }
    }

    function renderTasks(tasks) {
        const list = $("#task-list");

        if (!tasks.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">&#9634;</div>
                    <div class="empty-state-text">No tasks yet. Submit a prompt above to get started.</div>
                </div>`;
            return;
        }

        list.innerHTML = tasks
            .map((t) => {
                const title = escapeHtml(t.title || t.prompt.slice(0, 60));
                const prompt = escapeHtml(t.prompt);
                const time = formatTime(t.created_at);
                const canCancel = t.status === "pending" || t.status === "running";
                const canViewLogs = t.status === "running";

                return `
                <div class="task-card" data-id="${t.task_id}">
                    <div class="task-card-header">
                        <div class="task-title">${title}</div>
                        <div class="task-id">#${t.task_id}</div>
                    </div>
                    <div class="task-prompt">${prompt}</div>
                    <div class="task-meta">
                        <span class="status-badge status-${t.status}">${t.status}</span>
                        <span class="priority-badge">P${t.priority}</span>
                        <span class="time-badge">${time}</span>
                    </div>
                    <div class="task-actions">
                        ${canViewLogs ? `<button class="btn btn-secondary" onclick="app.viewLogs('${t.task_id}')">Logs</button>` : ""}
                        ${canCancel ? `<button class="btn btn-danger" onclick="app.cancelTask('${t.task_id}')">Cancel</button>` : ""}
                    </div>
                </div>`;
            })
            .join("");
    }

    async function submitTask() {
        const promptEl = $("#task-prompt");
        const titleEl = $("#task-title");
        const priorityEl = $("#task-priority");
        const submitBtn = $("#submit-btn");

        const prompt = promptEl.value.trim();
        if (!prompt) {
            showToast("Prompt cannot be empty", "error");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

        try {
            const task = await apiFetch("/api/tasks", {
                method: "POST",
                body: JSON.stringify({
                    prompt,
                    title: titleEl.value.trim(),
                    priority: parseInt(priorityEl.value, 10) || 0,
                }),
            });
            showToast(`Task #${task.task_id} submitted`, "success");
            promptEl.value = "";
            titleEl.value = "";
            priorityEl.value = "0";
            await loadTasks();
        } catch (err) {
            showToast(`Failed: ${err.message}`, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Task";
        }
    }

    async function cancelTask(taskId) {
        try {
            await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
            showToast(`Task #${taskId} cancelled`, "success");
            await loadTasks();
            await loadInstances();
        } catch (err) {
            showToast(`Failed: ${err.message}`, "error");
        }
    }

    // -----------------------------------------------------------------------
    // Instances
    // -----------------------------------------------------------------------
    async function loadInstances() {
        try {
            const instances = await apiFetch("/api/instances");
            renderInstances(instances);
            updateBadge("instances", instances.length);
            updateLogSelector(instances);
        } catch (err) {
            if (err.message !== "Unauthorized") {
                console.error("Failed to load instances:", err);
            }
        }
    }

    function renderInstances(instances) {
        const list = $("#instance-list");

        if (!instances.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">&#9881;</div>
                    <div class="empty-state-text">No running instances. Submit a task to start one.</div>
                </div>`;
            return;
        }

        list.innerHTML = instances
            .map((inst) => {
                const title = escapeHtml(inst.title);
                const started = formatTime(inst.started_at);

                return `
                <div class="instance-card" data-id="${inst.instance_id}">
                    <div class="instance-header">
                        <div class="instance-title">${title}</div>
                        <span class="status-badge status-${inst.status}">${inst.status}</span>
                    </div>
                    <div class="instance-meta">
                        <span>ID: ${inst.instance_id}</span>
                        <span>PID: ${inst.pid || "N/A"}</span>
                        <span>Started: ${started}</span>
                    </div>
                    <div class="instance-actions">
                        <button class="btn btn-secondary" onclick="app.viewLogs('${inst.instance_id}')">View Logs</button>
                        <button class="btn btn-danger" onclick="app.restartInstance('${inst.instance_id}')">Restart</button>
                    </div>
                </div>`;
            })
            .join("");
    }

    async function restartInstance(instanceId) {
        try {
            const result = await apiFetch(`/api/instances/${instanceId}/restart`, {
                method: "POST",
            });
            showToast(`Instance restarted (new ID: ${result.new_id})`, "success");
            await loadInstances();
        } catch (err) {
            showToast(`Failed: ${err.message}`, "error");
        }
    }

    // -----------------------------------------------------------------------
    // Logs
    // -----------------------------------------------------------------------
    function updateLogSelector(instances) {
        const select = $("#log-instance-select");
        const currentValue = select.value;

        // Keep existing options if possible
        const options = instances.map(
            (inst) =>
                `<option value="${inst.instance_id}">${inst.title} (#${inst.instance_id})</option>`
        );

        select.innerHTML =
            '<option value="">-- Select Instance --</option>' + options.join("");

        // Restore selection
        if (currentValue && instances.some((i) => i.instance_id === currentValue)) {
            select.value = currentValue;
        }
    }

    function viewLogs(instanceId) {
        switchTab("logs");
        const select = $("#log-instance-select");
        select.value = instanceId;
        connectToLogs(instanceId);
    }

    function connectToLogs(instanceId) {
        if (!instanceId) {
            wsClient.disconnect();
            updateConnectionStatus(false);
            return;
        }

        // Clear existing log
        const container = $("#log-output");
        container.innerHTML = '<div class="log-line info">[Connecting...]</div>';

        wsClient.onMessage = (message) => {
            appendLog(message);
        };

        wsClient.onStatusChange = (connected) => {
            updateConnectionStatus(connected);
            if (connected) {
                appendLog("[Connected to log stream]\n", "info");
            }
        };

        wsClient.connect(instanceId);
    }

    function appendLog(message, type = "") {
        const container = $("#log-output");
        const line = document.createElement("div");
        line.className = "log-line";

        if (type) {
            line.classList.add(type);
        } else if (message.includes("[ERROR]") || message.includes("[stderr]")) {
            line.classList.add("error");
        } else if (message.includes("[INFO]")) {
            line.classList.add("info");
        }

        line.textContent = message;
        container.appendChild(line);

        // Auto-scroll to bottom if near bottom
        const threshold = 100;
        const isNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }

        // Limit lines to 2000
        while (container.children.length > 2000) {
            container.removeChild(container.firstChild);
        }
    }

    function clearLogs() {
        const container = $("#log-output");
        container.innerHTML = "";
    }

    function updateConnectionStatus(connected) {
        const dot = $(".status-dot");
        const text = $(".status-text");
        if (dot) dot.classList.toggle("connected", connected);
        if (text) text.textContent = connected ? "Connected" : "Disconnected";
    }

    // -----------------------------------------------------------------------
    // Auto-refresh
    // -----------------------------------------------------------------------
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    async function refreshAll() {
        await Promise.allSettled([loadTasks(), loadInstances()]);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function updateBadge(tab, count) {
        const badge = $(`.tab-btn[data-tab="${tab}"] .badge`);
        if (badge) badge.textContent = count;
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatTime(isoString) {
        if (!isoString) return "--";
        try {
            const d = new Date(isoString + "Z"); // UTC
            const now = new Date();
            const diffMs = now - d;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHr = Math.floor(diffMin / 60);

            if (diffSec < 60) return `${diffSec}s ago`;
            if (diffMin < 60) return `${diffMin}m ago`;
            if (diffHr < 24) return `${diffHr}h ago`;
            return d.toLocaleDateString();
        } catch {
            return isoString;
        }
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------
    function init() {
        // Tab clicks
        $$(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => switchTab(btn.dataset.tab));
        });

        // Login
        $("#login-btn").addEventListener("click", handleLogin);
        $("#token-input").addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleLogin();
        });

        // Task form
        $("#submit-btn").addEventListener("click", submitTask);
        // Allow Ctrl+Enter to submit
        $("#task-prompt").addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitTask();
        });

        // Log instance selector
        $("#log-instance-select").addEventListener("change", (e) => {
            connectToLogs(e.target.value);
        });

        // Clear logs button
        $("#clear-logs-btn").addEventListener("click", clearLogs);

        // Check auth
        if (authToken) {
            window.__authToken = authToken;
            hideAuthScreen();
            refreshAll();
        } else {
            showAuthScreen();
        }

        // Register service worker
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then(() => console.log("[SW] Registered"))
                .catch((err) => console.warn("[SW] Registration failed:", err));
        }
    }

    // -----------------------------------------------------------------------
    // Public API (for onclick handlers in HTML)
    // -----------------------------------------------------------------------
    window.app = {
        cancelTask,
        restartInstance,
        viewLogs,
    };

    // Start
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
