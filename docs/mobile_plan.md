# Forge Mobile — Deployment Approval & Server Monitor

Plan for an Android application that serves as a 2FA/biometric gateway for deployment operations and real-time server monitor.

---

## Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   PC / CI/CD    │────►│  Forge API   │────►│  Android APK    │
│                 │     │  (Backend)   │     │                 │
│ • git push      │     │              │     │ • Push notif    │
│ • deploy cmd    │     │ • Auth       │     │ • Fingerprint   │
│ • Claude Code   │     │ • Queue      │     │ • Approve/Deny  │
│                 │◄────│ • WebSocket  │◄────│ • Live monitor  │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

### Key Features

| Feature                 | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| **Deployment Approval** | Push notification → biometrics → approve/reject             |
| **Server Monitor**      | Real-time container status, CPU/RAM, health checks          |
| **Log Viewer**          | Live log streaming with filtering                           |
| **Alerts**              | Notifications for service outages, high CPU, failed deploys |
| **Audit Trail**         | Who approved what, when, from which device                  |

---

## Architecture

### Components

```
forge-mobile/
├── backend/                    # Go API service
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── auth/               # JWT, TOTP, WebAuthn
│   │   ├── approval/           # Deployment approval queue
│   │   ├── monitor/            # Server metrics collector
│   │   ├── notify/             # FCM push notifications
│   │   ├── ws/                 # WebSocket hub
│   │   └── db/                 # SQLite/PostgreSQL
│   ├── api/                    # HTTP handlers
│   └── Dockerfile
│
├── android/                    # Kotlin Android app
│   ├── app/src/main/
│   │   ├── java/.../forge/
│   │   │   ├── ui/             # Jetpack Compose screens
│   │   │   ├── data/           # Repository, API client
│   │   │   ├── service/        # FCM, WebSocket, Biometric
│   │   │   └── model/          # Data classes
│   │   └── res/
│   └── build.gradle.kts
│
├── cli/                        # CLI plugin for deploy approval
│   └── forge-deploy            # Shell script / Go binary
│
└── docker-compose.yml          # Backend + Redis for deployment
```

### Tech Stack

| Component      | Technology                       | Reason                                                  |
| -------------- | -------------------------------- | ------------------------------------------------------- |
| **Backend**    | Go 1.22+                         | Fast, small binary, excellent for WebSocket/concurrency |
| **Database**   | SQLite (dev) / PostgreSQL (prod) | Approval log, device registry, audit trail              |
| **Push**       | Firebase Cloud Messaging (FCM)   | Free, reliable, Android native                          |
| **Real-time**  | WebSocket                        | Log and status streaming                                |
| **Android**    | Kotlin + Jetpack Compose         | Modern Android UI, native biometrics                    |
| **Auth**       | JWT + Biometrics + TOTP          | Multi-layered security model                            |
| **CI/CD Hook** | GitHub Actions / Generic Webhook | Triggers approval flow                                  |

---

## Phase 1: Backend API (Week 1-2)

### 1.1 Auth System

```
Device registration:
1. User logs in with Forge credentials (username/password)
2. Backend returns JWT access token + refresh token
3. Android registers FCM token and device fingerprint
4. Backend stores device in database (user_id, fcm_token, device_name, public_key)

Approval flow:
1. CI/CD sends POST /api/v1/approvals/ with deployment info
2. Backend creates approval request (status: pending, ttl: 5min)
3. Backend sends FCM push to all registered devices of the user
4. Android displays notification → user opens app
5. Biometric verification (fingerprint/face)
6. POST /api/v1/approvals/{id}/respond with {action: "approve", biometric_proof: ...}
7. Backend changes status to approved/rejected
8. CI/CD polls or receives webhook callback
```

### 1.2 API Endpoints

```
POST   /api/v1/auth/login          # Username/password → JWT
POST   /api/v1/auth/refresh         # Refresh token
POST   /api/v1/auth/devices         # Register device (FCM token)
DELETE /api/v1/auth/devices/{id}    # Remove device

POST   /api/v1/approvals/           # Create approval request (CI/CD)
GET    /api/v1/approvals/           # List pending approvals
GET    /api/v1/approvals/{id}       # Approval details
POST   /api/v1/approvals/{id}/respond  # Approve/Reject with biometrics

GET    /api/v1/servers/              # List servers
GET    /api/v1/servers/{id}/status   # Container status, CPU, RAM, disk
GET    /api/v1/servers/{id}/logs     # HTTP endpoint for log history
WS     /api/v1/ws/logs/{server_id}  # WebSocket for live log streaming
WS     /api/v1/ws/status            # WebSocket for real-time server metrics

GET    /api/v1/deployments/          # Deployment history
GET    /api/v1/audit/                # Audit trail (who, what, when)
```

### 1.3 Database Schema

```sql
-- Users (synced with Forge/AWX)
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registered devices
CREATE TABLE devices (
    id TEXT PRIMARY KEY,              -- UUID
    user_id INTEGER REFERENCES users,
    name TEXT NOT NULL,                -- "Pixel 8 Pro"
    fcm_token TEXT NOT NULL,
    public_key TEXT,                   -- For WebAuthn
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval requests
CREATE TABLE approvals (
    id TEXT PRIMARY KEY,              -- UUID
    deployment_id TEXT NOT NULL,       -- External ID from CI/CD
    server TEXT NOT NULL,              -- Target server
    action TEXT NOT NULL,              -- "deploy", "rollback", "restart"
    description TEXT,                  -- "Deploy forge v2.1.3 to production"
    metadata JSONB,                    -- Commit hash, branch, image tag, etc.
    status TEXT DEFAULT 'pending',     -- pending, approved, rejected, expired
    requested_by TEXT,                 -- Who initiated the deploy
    responded_by INTEGER REFERENCES users,
    responded_at TIMESTAMP,
    biometric_verified BOOLEAN DEFAULT FALSE,
    device_id TEXT REFERENCES devices,
    expires_at TIMESTAMP NOT NULL,
    callback_url TEXT,                 -- Webhook for CI/CD callback
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Servers for monitoring
CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                -- "forge-prod", "forge-staging"
    host TEXT NOT NULL,                -- SSH host or Docker API endpoint
    ssh_user TEXT,
    ssh_key_path TEXT,
    monitoring_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users,
    device_id TEXT REFERENCES devices,
    action TEXT NOT NULL,               -- "approve", "reject", "login", "register_device"
    resource_type TEXT,                 -- "approval", "server", "deployment"
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.4 Push Notification Payload

```json
{
  "notification": {
    "title": "Deployment Approval Required",
    "body": "Deploy forge v2.1.3 to production (forge-prod)"
  },
  "data": {
    "type": "deployment_approval",
    "approval_id": "abc-123",
    "server": "forge-prod",
    "action": "deploy",
    "image": "ghcr.io/forgeplatform/forge:2.1.3",
    "commit": "a6705d9",
    "branch": "modernization",
    "requested_by": "krle",
    "expires_at": "2026-03-04T17:00:00Z"
  }
}
```

---

## Phase 2: Android Application (Week 2-4)

### 2.1 Screens

```
┌─────────────────────────────────────┐
│ LOGIN                               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Forge Server URL              │  │
│  │ https://forge.example.com     │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Username                      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Password                      │  │
│  └───────────────────────────────┘  │
│                                     │
│  [ Enable Biometric Login ]         │
│                                     │
│  ┌───────────────────────────────┐  │
│  │         Sign In               │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ DASHBOARD                      ≡  │
│                                     │
│ ┌─ Pending Approvals ────────────┐  │
│ │ 🔴 Deploy forge v2.1.3        │  │
│ │    forge-prod • 3m ago         │  │
│ │    [Approve]  [Reject]         │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌─ Servers ──────────────────────┐  │
│ │ 🟢 forge-prod    CPU 23%      │  │
│ │ 🟢 forge-staging CPU 8%       │  │
│ │ 🔴 forge-dev     OFFLINE      │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌─ Recent Deployments ───────────┐  │
│ │ ✅ v2.1.2 → prod   2h ago     │  │
│ │ ✅ v2.1.3 → staging 30m ago   │  │
│ │ ❌ v2.1.3 → prod   PENDING    │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │Home│ │Srvr│ │Logs│ │Prof│       │
│ └────┘ └────┘ └────┘ └────┘       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ APPROVAL DETAIL                ←   │
│                                     │
│ Deploy forge v2.1.3                 │
│ ──────────────────────────────────  │
│ Server:    forge-prod               │
│ Image:     ghcr.io/forgeplatform/forge:2.1.3 │
│ Branch:    modernization            │
│ Commit:    a6705d9                  │
│ Requested: krle (3 min ago)         │
│ Expires:   2 min remaining          │
│                                     │
│ Changes:                            │
│ • fix auth flow                     │
│ • add docker compose dev overlay    │
│ • update changelog                  │
│                                     │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ │    🔒 Scan fingerprint to     │   │
│ │       approve deployment      │   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ ┌──────────┐    ┌──────────────┐   │
│ │  Reject  │    │   Approve    │   │
│ └──────────┘    └──────────────┘   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ SERVER DETAIL              ←   🔄  │
│                                     │
│ forge-prod                          │
│ ──────────────────────────────────  │
│                                     │
│ ┌─ Containers ───────────────────┐  │
│ │ 🟢 forge-web   Up 3d  120MB  │  │
│ │ 🟢 forge-task  Up 3d  340MB  │  │
│ │ 🟢 postgres    Up 3d  85MB   │  │
│ │ 🟢 redis       Up 3d  12MB   │  │
│ │ 🟢 nginx       Up 3d  8MB    │  │
│ └────────────────────────────────┘  │
│                                     │
│ CPU  ▓▓▓▓░░░░░░░░░░░░░░░░  23%    │
│ RAM  ▓▓▓▓▓▓▓░░░░░░░░░░░░░  38%    │
│ Disk ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░  55%    │
│                                     │
│ ┌─ Quick Actions ────────────────┐  │
│ │ [Restart]  [Stop]  [Logs]      │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │Home│ │Srvr│ │Logs│ │Prof│       │
│ └────┘ └────┘ └────┘ └────┘       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ LIVE LOGS                  ← ⏸ 🔍 │
│                                     │
│ forge-prod > forge-web                │
│ ──────────────────────────────────  │
│ 16:45:01 GET /api/v2/me/ 200 12ms  │
│ 16:45:02 GET /api/v2/jobs/ 200 45ms│
│ 16:45:03 POST /api/v2/job_templ..  │
│ 16:45:03 GET /api/v2/config/ 200   │
│ 16:45:05 WS connect user=admin     │
│ 16:45:06 GET /api/v2/dashboard/    │
│ 16:45:08 POST /api/login/ 302      │
│ 16:45:09 GET /api/v2/me/ 200 8ms   │
│ 16:45:10 GET /api/v2/projects/     │
│ 16:45:11 GET /api/v2/inventories/  │
│ 16:45:12 POST /api/v2/job_templ..  │
│ 16:45:13 Job #42 launched by admin │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│ Auto-scroll: ON                     │
│                                     │
│ Container: [forge-web ▼]  Level: ALL  │
│                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │Home│ │Srvr│ │Logs│ │Prof│       │
│ └────┘ └────┘ └────┘ └────┘       │
└─────────────────────────────────────┘
```

### 2.2 Android Libraries

```kotlin
// build.gradle.kts (app)
dependencies {
    // UI
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Biometrics
    implementation("androidx.biometric:biometric:1.2.0-alpha05")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.java-websocket:Java-WebSocket:1.5.7")

    // Push
    implementation("com.google.firebase:firebase-messaging:24.1.0")

    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")  // EncryptedSharedPreferences

    // DI
    implementation("io.insert-koin:koin-androidx-compose:4.0.0")
}
```

### 2.3 Biometric Auth Flow

```kotlin
// BiometricHelper.kt
class BiometricHelper(private val activity: FragmentActivity) {

    fun authenticate(
        title: String = "Verify Identity",
        subtitle: String = "Scan fingerprint to approve",
        onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit,
        onError: (String) -> Unit
    ) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                or BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()

        val biometricPrompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: ...) {
                    onSuccess(result)
                }
                override fun onAuthenticationError(code: Int, msg: CharSequence) {
                    onError(msg.toString())
                }
            }
        )

        biometricPrompt.authenticate(promptInfo)
    }
}
```

---

## Phase 3: CI/CD Integration (Week 4-5)

### 3.1 GitHub Actions Step

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    tags: ["v*"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t ghcr.io/forgeplatform/forge:${{ github.ref_name }} .

      - name: Push image
        run: docker push ghcr.io/forgeplatform/forge:${{ github.ref_name }}

      - name: Request deployment approval
        id: approval
        run: |
          RESPONSE=$(curl -s -X POST \
            ${{ secrets.FORGE_MOBILE_API }}/api/v1/approvals/ \
            -H "Authorization: Bearer ${{ secrets.FORGE_MOBILE_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "server": "forge-prod",
              "action": "deploy",
              "description": "Deploy ${{ github.ref_name }}",
              "metadata": {
                "image": "ghcr.io/forgeplatform/forge:${{ github.ref_name }}",
                "commit": "${{ github.sha }}",
                "branch": "${{ github.ref_name }}",
                "actor": "${{ github.actor }}"
              },
              "ttl_seconds": 300
            }')
          echo "approval_id=$(echo $RESPONSE | jq -r .id)" >> $GITHUB_OUTPUT

      - name: Wait for approval
        run: |
          for i in $(seq 1 60); do
            STATUS=$(curl -s \
              ${{ secrets.FORGE_MOBILE_API }}/api/v1/approvals/${{ steps.approval.outputs.approval_id }} \
              -H "Authorization: Bearer ${{ secrets.FORGE_MOBILE_TOKEN }}" \
              | jq -r .status)
            echo "Attempt $i: status=$STATUS"
            if [ "$STATUS" = "approved" ]; then
              echo "Deployment approved!"
              exit 0
            elif [ "$STATUS" = "rejected" ]; then
              echo "Deployment rejected."
              exit 1
            elif [ "$STATUS" = "expired" ]; then
              echo "Approval expired."
              exit 1
            fi
            sleep 5
          done
          echo "Timeout waiting for approval."
          exit 1

      - name: Deploy
        if: success()
        run: |
          ssh deploy@forge-prod "cd /opt/forge && \
            docker compose pull && \
            docker compose up -d"
```

### 3.2 CLI Command for Manual Deploy

```bash
#!/bin/bash
# forge-deploy — requests approval before deployment

set -e

SERVER=${1:?Usage: forge-deploy <server> [image_tag]}
TAG=${2:-latest}

echo "Requesting approval for deploy $TAG to $SERVER..."

APPROVAL=$(curl -s -X POST "$FORGE_MOBILE_API/api/v1/approvals/" \
  -H "Authorization: Bearer $FORGE_MOBILE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"server\": \"$SERVER\",
    \"action\": \"deploy\",
    \"description\": \"Manual deploy $TAG to $SERVER\",
    \"metadata\": {\"image_tag\": \"$TAG\"},
    \"ttl_seconds\": 300
  }")

APPROVAL_ID=$(echo "$APPROVAL" | jq -r .id)
echo "Approval ID: $APPROVAL_ID"
echo "Waiting for mobile approval (5 min timeout)..."

while true; do
  STATUS=$(curl -s "$FORGE_MOBILE_API/api/v1/approvals/$APPROVAL_ID" \
    -H "Authorization: Bearer $FORGE_MOBILE_TOKEN" | jq -r .status)

  case "$STATUS" in
    approved) echo "APPROVED. Deploying..."; break ;;
    rejected) echo "REJECTED. Aborting."; exit 1 ;;
    expired)  echo "EXPIRED. Aborting."; exit 1 ;;
    *)        printf "."; sleep 3 ;;
  esac
done

# Start deploy
ssh "deploy@$SERVER" "cd /opt/forge && docker compose pull && docker compose up -d"
echo "Deploy complete."
```

---

## Phase 4: Server Monitoring Agent (Week 5-6)

### 4.1 Lightweight Agent on the Server

A small Go binary that runs on each server and sends metrics to the backend.

```go
// Metrics collected by the agent
type ServerMetrics struct {
    Hostname    string             `json:"hostname"`
    CPUPercent  float64            `json:"cpu_percent"`
    MemTotal    uint64             `json:"mem_total"`
    MemUsed     uint64             `json:"mem_used"`
    DiskTotal   uint64             `json:"disk_total"`
    DiskUsed    uint64             `json:"disk_used"`
    Containers  []ContainerStatus  `json:"containers"`
    Uptime      int64              `json:"uptime_seconds"`
    CollectedAt time.Time          `json:"collected_at"`
}

type ContainerStatus struct {
    ID      string `json:"id"`
    Name    string `json:"name"`
    Image   string `json:"image"`
    Status  string `json:"status"`    // running, exited, restarting
    Health  string `json:"health"`    // healthy, unhealthy, none
    CPUPerc string `json:"cpu_perc"`
    MemUsage string `json:"mem_usage"`
    Uptime  string `json:"uptime"`
}
```

### 4.2 Alert Rules

```yaml
# alerts.yml — configured in the backend
rules:
  - name: container_down
    condition: "container.status != 'running'"
    severity: critical
    message: "Container {{.Name}} is {{.Status}} on {{.Server}}"

  - name: high_cpu
    condition: "server.cpu_percent > 85"
    duration: 5m
    severity: warning
    message: "High CPU ({{.Value}}%) on {{.Server}}"

  - name: high_memory
    condition: "server.mem_used / server.mem_total > 0.90"
    severity: warning
    message: "Memory usage {{.Percent}}% on {{.Server}}"

  - name: disk_space
    condition: "server.disk_used / server.disk_total > 0.85"
    severity: warning
    message: "Disk usage {{.Percent}}% on {{.Server}}"

  - name: deploy_failed
    condition: "deployment.status == 'failed'"
    severity: critical
    message: "Deployment {{.ID}} failed on {{.Server}}"
```

---

## Phase 5: Security (Across All Phases)

### 5.1 Security Model

```
Layer 1: HTTPS (TLS 1.3) for all communication
Layer 2: JWT access token (15min TTL) + refresh token (7d)
Layer 3: Device registration (bound to user)
Layer 4: Biometrics for approval actions (fingerprint/face)
Layer 5: Audit log for every operation
```

### 5.2 Key Security Measures

| Measure             | Implementation                                              |
| ------------------- | ----------------------------------------------------------- |
| Token storage       | Android EncryptedSharedPreferences (AES-256)                |
| Biometric binding   | Android Keystore hardware-backed keys                       |
| API rate limiting   | 10 req/sec per device, 3 failed auth → 15min lockout        |
| Approval expiry     | Max 5 min TTL, cannot be extended                           |
| Device revocation   | Admin can deactivate a device instantly                     |
| Audit trail         | All actions logged with IP, device, timestamp               |
| FCM security        | Data-only messages (do not display content without the app) |
| Certificate pinning | OkHttp CertificatePinner for backend communication          |

### 5.3 Threat Model

| Threat         | Mitigation                                      |
| -------------- | ----------------------------------------------- |
| Stolen phone   | Biometrics required, token in encrypted storage |
| MITM attack    | TLS + certificate pinning                       |
| Replay attack  | JWT with short TTL, approval nonce              |
| Brute force    | Rate limiting + account lockout                 |
| Insider threat | Audit trail, device binding, biometric proof    |

---

## Timeline

```
Week 1-2:  Backend API (Go) — auth, approvals, push notifications
Week 2-4:  Android app (Kotlin) — login, dashboard, approval flow, biometrics
Week 4-5:  CI/CD integration — GitHub Actions, CLI tool
Week 5-6:  Monitoring agent — metrics, logs, alerts
Week 6-7:  Testing + security audit + polish
Week 7:    Release APK (sideload or F-Droid)
```

**Total: ~7 weeks**

---

## MVP Priorities

Minimum product that is already useful:

1. **Backend:** Auth + Approval endpoints + FCM push
2. **Android:** Login + Approval screen + Fingerprint
3. **CLI:** `forge-deploy` command

Everything else (monitoring, log viewer, alerts) comes in v2.

---

## Phase 6: AI Assistant in the Mobile Application (Week 7-8)

### 6.1 Overview

Integrate Forge AI Assistant (Ollama RAG Chat) into the Android application.
Uses the same backend endpoint `/api/v2/assistant/` as the web UI.

Detailed plan for AI Assistant backend: see `docs/chat_plan.md`

### 6.2 Chat Screen

```
┌─────────────────────────────────────┐
│ AI Assistant                   ←   │
│                                     │
│  ┌────────────────────────────────┐ │
│  │ 🤖 Hi! I'm your Forge         │ │
│  │    assistant. Ask me anything. │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌────────────────────────────────┐ │
│  │ 👤 How do I restart a failed   │ │
│  │    job from my phone?          │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌────────────────────────────────┐ │
│  │ 🤖 To relaunch a failed job:  │ │
│  │    1. Go to Jobs tab           │ │
│  │    2. Tap the failed job       │ │
│  │    3. Tap "Relaunch"           │ │
│  │                                │ │
│  │ 📎 user_guide/jobs.md         │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌──────────────────────┐  ┌─────┐ │
│  │ Ask anything...      │  │ 🎤  │ │
│  └──────────────────────┘  └─────┘ │
│                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌───┐ │
│ │Home│ │Srvr│ │Logs│ │ AI │ │Prf│ │
│ └────┘ └────┘ └────┘ └────┘ └───┘ │
└─────────────────────────────────────┘
```

### 6.3 Android Implementation

```kotlin
// ChatScreen.kt — Jetpack Compose
@Composable
fun ChatScreen(viewModel: ChatViewModel = koinViewModel()) {
    val messages by viewModel.messages.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        // Chat messages list
        LazyColumn(
            modifier = Modifier.weight(1f),
            reverseLayout = true
        ) {
            items(messages.reversed()) { msg ->
                ChatBubble(msg)
            }
        }

        // Input field
        ChatInput(
            onSend = { viewModel.sendMessage(it) },
            onVoice = { viewModel.startVoiceInput() },
            enabled = !isStreaming
        )
    }
}
```

```kotlin
// ChatViewModel.kt — SSE streaming
class ChatViewModel(private val api: ForgeApi) : ViewModel() {
    val messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val isStreaming = MutableStateFlow(false)

    fun sendMessage(text: String) {
        viewModelScope.launch {
            messages.update { it + ChatMessage("user", text) }
            isStreaming.value = true

            // Stream response from backend
            val botMsg = StringBuilder()
            messages.update { it + ChatMessage("assistant", "") }

            api.streamAssistant(text).collect { token ->
                botMsg.append(token)
                messages.update { msgs ->
                    msgs.toMutableList().apply {
                        this[lastIndex] = ChatMessage("assistant", botMsg.toString())
                    }
                }
            }

            isStreaming.value = false
        }
    }

    fun startVoiceInput() {
        // Android SpeechRecognizer → text → sendMessage()
    }
}
```

### 6.4 Mobile-Specific Features

| Feature           | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| **Voice Input**   | Android Speech-to-Text — ask by voice                             |
| **Quick Actions** | Bot suggests actions with buttons (Restart, View Logs)            |
| **Offline FAQ**   | Cached most common answers, works without internet                |
| **Push + Chat**   | From push notification (failed job) → directly into chat for help |
| **Contextual**    | Knows which screen the user came from (Server, Job, Log)          |

### 6.5 Voice Input Flow

```
1. User holds the microphone button
2. Android SpeechRecognizer records voice
3. Speech-to-Text converts to text
4. Text is sent to /api/v2/assistant/
5. Response is displayed in chat
6. (Optional) Text-to-Speech reads the response
```

---

## Future Development (Post-MVP)

- **iOS version** — SwiftUI + Face ID
- **Telegram/Signal bot** — alternative for approval without APK
- **Multi-approver** — require 2/3 approvers for production
- **Rollback button** — instant rollback from phone
- **Grafana dashboards** — embed in app
- **Webhook integrations** — Slack, Discord, email notifications
- **Geo-fencing** — allow approval only from specific locations
- **AI Assistant Fine-tuning** — train the model on Forge-specific data
