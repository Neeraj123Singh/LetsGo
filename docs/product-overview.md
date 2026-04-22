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
