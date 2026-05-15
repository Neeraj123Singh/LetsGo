package com.letsgo.auth.dto;

import java.time.Instant;

public record ContactView(
        UserSummary user,
        Instant connectedAt
) {
}
