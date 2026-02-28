/**
 * VibeCoding Web Manager - WebSocket Client
 * Handles real-time log streaming with auto-reconnect and heartbeat.
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.instanceId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseDelay = 1000;       // 1 second
        this.maxDelay = 30000;       // 30 seconds
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.onMessage = null;       // callback(message: string)
        this.onStatusChange = null;  // callback(connected: boolean)
        this._reconnectTimer = null;
        this._intentionalClose = false;
    }

    /**
     * Connect to a specific instance's log stream.
     * @param {string} instanceId
     */
    connect(instanceId) {
        this._intentionalClose = false;
        this.instanceId = instanceId;
        this.reconnectAttempts = 0;
        this._doConnect();
    }

    /**
     * Disconnect and stop reconnecting.
     */
    disconnect() {
        this._intentionalClose = true;
        this._clearTimers();

        if (this.ws) {
            this.ws.close(1000, "Client disconnect");
            this.ws = null;
        }
        this.instanceId = null;
        this._notifyStatus(false);
    }

    /**
     * Internal: perform the actual WebSocket connection.
     */
    _doConnect() {
        if (!this.instanceId) return;

        const token = window.__authToken || localStorage.getItem("vibe_token") || "";
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${protocol}//${window.location.host}/ws/logs/${this.instanceId}?token=${encodeURIComponent(token)}`;

        try {
            this.ws = new WebSocket(url);
        } catch (err) {
            console.error("[WS] Failed to create WebSocket:", err);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log(`[WS] Connected to instance ${this.instanceId}`);
            this.reconnectAttempts = 0;
            this._notifyStatus(true);
            this._startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            // Reset heartbeat timeout on any received message
            this._resetHeartbeatTimeout();

            const data = event.data;

            // Ignore pong responses (heartbeat replies)
            if (data === "pong" || data === "") return;

            if (this.onMessage) {
                this.onMessage(data);
            }
        };

        this.ws.onclose = (event) => {
            console.log(`[WS] Connection closed (code=${event.code})`);
            this._clearTimers();
            this._notifyStatus(false);

            if (!this._intentionalClose && event.code !== 4001) {
                this._scheduleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error("[WS] Error:", error);
        };
    }

    /**
     * Schedule a reconnect attempt with exponential backoff.
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn("[WS] Max reconnect attempts reached");
            return;
        }

        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.reconnectAttempts),
            this.maxDelay
        );
        // Add jitter (0-25% of delay)
        const jitter = delay * Math.random() * 0.25;
        const totalDelay = delay + jitter;

        console.log(`[WS] Reconnecting in ${Math.round(totalDelay)}ms (attempt ${this.reconnectAttempts + 1})`);

        this._reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this._doConnect();
        }, totalDelay);
    }

    /**
     * Start heartbeat ping/pong cycle.
     */
    _startHeartbeat() {
        this._clearTimers();

        // Send a ping every 25 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send("ping");

                // Expect a response within 10 seconds
                this.heartbeatTimeout = setTimeout(() => {
                    console.warn("[WS] Heartbeat timeout, reconnecting...");
                    if (this.ws) {
                        this.ws.close(4000, "Heartbeat timeout");
                    }
                }, 10000);
            }
        }, 25000);
    }

    /**
     * Reset the heartbeat timeout (called on any incoming message).
     */
    _resetHeartbeatTimeout() {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    /**
     * Clear all timers.
     */
    _clearTimers() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    /**
     * Notify status change callback.
     */
    _notifyStatus(connected) {
        if (this.onStatusChange) {
            this.onStatusChange(connected);
        }
    }
}

// Export as global
window.WebSocketClient = WebSocketClient;
