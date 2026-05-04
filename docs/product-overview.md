# Product Overview

## What We Are Building

This product is a cloud-native video meeting platform with:

- secure authentication and authorization
- one-to-one and group video calling
- real-time in-meeting chat
- searchable meeting and message history
- analytics and call quality insights

## Core User Personas

- **Host**: creates and manages meetings, controls moderation features
- **Participant**: joins meetings, uses chat, audio, and video controls
- **Admin**: manages users, roles, policies, and operational settings

## Key Product Capabilities

- Meeting lifecycle: create, schedule, join, leave, end
- Real-time communication: chat + video/audio calling
- Identity and access: login, token-based auth, role-based permissions
- Search and discovery: find meetings/messages through Elasticsearch
- Reliability and observability: monitoring, alerting, tracing

## Prototype in the letsgo repository (2026)

The runnable application today demonstrates **group mesh video**, **invite-by-email** with a **notify WebSocket** and **ringing / Accept–Decline** UI, **browser notifications** for incoming calls, and **optional on-device background blur or still-image background** during a call. These align with the product goals above while using a smaller backend surface than the full multi-store design. For the exact stack and file list, see `docs/changes/2026-05-04.md` and the **Letsgo repository** section in `docs/architecture/system-overview.md`.

## Platform and Technology Fit

- React frontend for user experience
- Go backend for high-performance APIs and websocket workloads
- Python and AWS Lambda for analytics and event-driven tasks
- Spring Boot auth service for enterprise-grade security workflows
- PostgreSQL + DynamoDB for mixed transactional and high-throughput workloads

## Business Outcomes

- Faster and reliable virtual collaboration
- Better meeting insights with engagement and quality metrics
- Scalable architecture that supports independent service growth
- Strong operational visibility and production readiness

## Success Metrics

- Active users and meeting completion rate
- Chat and calling reliability (disconnect and failure rate)
- API and websocket latency
- Call quality metrics (RTT, jitter, packet loss)
- Deployment frequency and mean time to recovery (MTTR)
