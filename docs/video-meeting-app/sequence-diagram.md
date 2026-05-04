# Sequence Diagram

## Sequence 1: Join Meeting and Start Call

```mermaid
sequenceDiagram
    autonumber
    participant User as User/React
    participant Auth as Auth Service (Spring Boot)
    participant API as Backend API + WS (Go)
    participant PG as PostgreSQL
    participant DDB as DynamoDB
    participant SFU as SFU/Media
    participant EVT as Event Bus
    participant AN as Analytics (Python/Lambda)

    User->>Auth: Login(credentials)
    Auth-->>User: JWT + refresh token
    User->>API: Create/Join Meeting (JWT)
    API->>PG: Upsert meeting_participants
    API-->>User: Meeting details + WS endpoint + ICE config

    User->>API: Open WebSocket (JWT)
    API->>DDB: Update presence_state
    API-->>User: Participant roster and state

    User->>API: Send WebRTC offer
    API->>DDB: Persist signal event (TTL)
    API->>SFU: Forward offer/ICE negotiation
    SFU-->>User: Answer/ICE candidates

    API->>EVT: Publish participant_joined/call_started
    EVT-->>AN: Consume events
    AN->>PG: Store aggregates
```

## Sequence 2: Send In-Meeting Chat Message

```mermaid
sequenceDiagram
    autonumber
    participant UserA as Sender
    participant API as Backend WS/Chat (Go)
    participant DDB as DynamoDB chat_events
    participant PG as PostgreSQL
    participant UserB as Receiver
    participant EVT as Event Bus
    participant AN as Analytics

    UserA->>API: WS chat message(room_id, text)
    API->>DDB: Put chat event
    API->>PG: Optional durable/audit write
    API-->>UserB: Fanout message via WS
    API->>EVT: Publish chat_message_sent
    EVT-->>AN: Consume event
    AN->>PG: Update chat metrics
```

## Sequence 3: Prototype — mesh join + invite ring (letsgo)

This matches **`services/meeting-go`** + **`frontend`** behavior in Docker/local dev: no SFU, no DynamoDB. Callee must have the app open with an active **notify** WebSocket.

```mermaid
sequenceDiagram
    autonumber
    participant A as Caller browser
    participant MTG as meeting-go
    participant B as Callee browser
    participant PG as PostgreSQL

    A->>MTG: WSS /meeting/ws/v1/notify (JWT)
    B->>MTG: WSS /meeting/ws/v1/notify (JWT)
    A->>MTG: invite(targetEmail, roomId, callId)
    MTG->>PG: LookupUserByEmail
    MTG-->>B: incoming-call(from, roomId, callId)
    B-->>B: Ring + optional Notification API
    B->>MTG: invite-accepted(callId) or invite-decline(callId)
    MTG-->>A: invite-accepted / invite-declined
    A->>MTG: WSS /meeting/ws/v1/room (JWT, roomId)
    B->>MTG: WSS /meeting/ws/v1/room (JWT, roomId)
    A<<->>B: WebRTC mesh (SDP/ICE via meeting-go relay)
```
