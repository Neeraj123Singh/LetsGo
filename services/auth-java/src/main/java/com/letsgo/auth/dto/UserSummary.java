package com.letsgo.auth.dto;

import java.util.UUID;

public record UserSummary(UUID id, String email, String displayName) {
}
