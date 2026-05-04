package com.letsgo.auth.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import com.letsgo.auth.config.LetsgoProperties;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final LetsgoProperties.Jwt props;

    public JwtService(LetsgoProperties letsgoProperties) {
        this.props = letsgoProperties.jwt();
    }

    public String generateToken(UUID userId) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + props.expirationMs());
        return Jwts.builder()
                .subject(userId.toString())
                .issuedAt(now)
                .expiration(exp)
                .signWith(signingKey())
                .compact();
    }

    public UUID parseUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.getSubject());
    }

    private SecretKey signingKey() {
        byte[] keyBytes = props.secret().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalStateException("letsgo.jwt.secret must be at least 32 bytes (UTF-8) for HS256");
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
