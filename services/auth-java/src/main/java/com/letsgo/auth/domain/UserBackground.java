package com.letsgo.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_backgrounds")
public class UserBackground {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(name = "mime_type", nullable = false, length = 64)
    private String mimeType;

    @Column(name = "data_url", nullable = false, columnDefinition = "TEXT")
    private String dataUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected UserBackground() {}

    public UserBackground(UUID userId, String label, String mimeType, String dataUrl) {
        this.userId = userId;
        this.label = label;
        this.mimeType = mimeType;
        this.dataUrl = dataUrl;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getLabel() { return label; }
    public String getMimeType() { return mimeType; }
    public String getDataUrl() { return dataUrl; }
    public Instant getCreatedAt() { return createdAt; }
}
