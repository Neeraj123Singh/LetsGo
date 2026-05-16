-- User-uploaded backgrounds for the in-meeting "background" camera effect.
-- The image is stored as a base64 data URL so we don't need to set up object
-- storage just for this. Hard-cap the row size so the table stays tractable;
-- the application also enforces a per-image limit before insert.
CREATE TABLE user_backgrounds (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       VARCHAR(120) NOT NULL,
    mime_type   VARCHAR(64)  NOT NULL,
    data_url    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_bg_label_len    CHECK (char_length(label) BETWEEN 1 AND 120),
    CONSTRAINT chk_user_bg_mime         CHECK (mime_type IN (
        'image/jpeg','image/png','image/webp','image/gif'
    )),
    -- ~3 MB of base64 ≈ 2.2 MB raw. Keeps a few dozen images per user cheap.
    CONSTRAINT chk_user_bg_data_url_len CHECK (
        data_url LIKE 'data:image/%' AND char_length(data_url) <= 3145728
    )
);

CREATE INDEX idx_user_bg_user_created ON user_backgrounds (user_id, created_at DESC);
