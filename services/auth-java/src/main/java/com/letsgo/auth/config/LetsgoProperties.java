package com.letsgo.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

@ConfigurationProperties(prefix = "letsgo")
public record LetsgoProperties(
        Jwt jwt,
        String corsAllowedOrigins
) {

    public record Jwt(String secret, long expirationMs) {
    }

    public List<String> parsedCorsOrigins() {
        if (corsAllowedOrigins == null || corsAllowedOrigins.isBlank()) {
            return List.of("http://localhost:5173");
        }
        return Arrays.stream(corsAllowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
