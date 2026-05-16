package com.letsgo.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record BackgroundView(
        UUID id,
        String label,
        String mimeType,
        String dataUrl,
        Instant createdAt
) {}
