package com.letsgo.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record ConnectionRequestView(
        UUID id,
        UserSummary requester,
        UserSummary addressee,
        String status,
        String direction,
        Instant createdAt
) {
}
