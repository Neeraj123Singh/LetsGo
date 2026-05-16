package com.letsgo.auth.security;

import com.letsgo.auth.config.LetsgoProperties;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtServiceTest {

    private static final String SECRET = "changeme-letsgo-dev-secret-32chars-min!!";

    private JwtService service() {
        var props = new LetsgoProperties(new LetsgoProperties.Jwt(SECRET, 3600_000), "http://localhost:5173");
        return new JwtService(props);
    }

    @Test
    void generateThenParse_roundTrip() {
        JwtService jwt = service();
        UUID id = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        String token = jwt.generateToken(id);
        assertEquals(id, jwt.parseUserId(token));
    }

    @Test
    void parseUserId_rejectsGarbage() {
        assertThrows(Exception.class, () -> service().parseUserId("not-a-jwt"));
    }
}
