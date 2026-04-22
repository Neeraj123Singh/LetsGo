# Data Flow Diagram

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

## Data Movement Notes

- Chat writes can first land in DynamoDB for low-latency fanout, then be compacted or mirrored to PostgreSQL for audit/reporting.
- Meeting metadata and participant state changes are persisted in PostgreSQL.
- Search indexing consumes backend and analytics events for near-real-time discovery.
