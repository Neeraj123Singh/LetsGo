# Data Flow Diagram

## Target production data flow

The diagram below describes the **long-term** platform: shared Go API, optional DynamoDB for high-volume signaling/chat, SFU for media, and analytics/event indexing.

```mermaid
flowchart LR
    U[User Browser / React App] -->|HTTPS| ALB[AWS ALB]
    ALB --> ING[Ingress: ALB Controller or NGINX]

    ING --> AUTH[Auth Service - Spring Boot]
    ING --> API[Backend API + WS Gateway - Go]

    API --> PG[(PostgreSQL)]
    API --> DDB[(DynamoDB)]
    API --> ES[(Elasticsearch)]
    API --> EVT[(Event Bus: SNS/SQS/Kafka)]

    U <-->|WebSocket| API
    U <-->|WebRTC media| SFU[SFU/Media Nodes]
    U <-->|STUN/TURN| TURN[TURN/STUN Service]

    EVT --> AN[Analytics Workers - Python]
    EVT --> LMB[AWS Lambda Handlers]
    AN --> PG
    AN --> DDB
    AN --> ES
    LMB --> DDB
    LMB --> ES

    API --> OTEL[OpenTelemetry Collector]
    AUTH --> OTEL
    AN --> OTEL
    OTEL --> PRM[Prometheus]
    PRM --> GRA[Grafana]
```

## Letsgo prototype (Docker / local dev)

The repository currently runs a **smaller** path: React behind nginx (or Vite dev server), **auth-java** for `/api`, **meeting-go** for `/meeting` (HTTP lookup + two WebSocket routes), and **PostgreSQL** for users only. WebRTC media flows **mesh** between browsers; meeting-go relays SDP/ICE only.

```mermaid
flowchart LR
    U[Browser / React] -->|HTTPS /api| AUTH[auth-java]
    U -->|HTTPS + WSS /meeting| MTG[meeting-go]
    AUTH --> PG[(PostgreSQL users)]
    MTG --> PG
    U <-->|WebRTC mesh P2P| U2[Peer browsers]
```

Notify WebSocket delivers **`incoming-call`** payloads to online callees; room WebSocket carries **`webrtc-*`** messages between participants in the same `roomId`. See `services/meeting-go/README.md` and `docs/changes/2026-05-04.md`.

## Data movement notes (target platform)

- Chat writes can first land in DynamoDB for low-latency fanout, then be compacted or mirrored to PostgreSQL for audit/reporting.
- Meeting metadata and participant state changes are persisted in PostgreSQL.
- Search indexing consumes backend and analytics events for near-real-time discovery.
