-- 1:1 chat history between users.
CREATE TABLE direct_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_dm_body_len CHECK (char_length(body) BETWEEN 1 AND 4000),
    CONSTRAINT chk_dm_not_self CHECK (sender_id <> recipient_id)
);

CREATE INDEX idx_dm_pair_created
ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);

CREATE INDEX idx_dm_recipient ON direct_messages (recipient_id, created_at DESC);
CREATE INDEX idx_dm_sender    ON direct_messages (sender_id, created_at DESC);

-- In-meeting chat. room_id is the same opaque string the WebRTC signaling uses.
CREATE TABLE room_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     VARCHAR(128) NOT NULL,
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rm_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX idx_room_messages_room ON room_messages (room_id, created_at DESC);

-- Recent-contacts surface: cached "last interaction" timestamp per user pair.
-- Populated lazily when a call is placed or message is sent.
CREATE TABLE recent_interactions (
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_kind    VARCHAR(16) NOT NULL,
    last_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, peer_id),
    CONSTRAINT chk_recent_not_self CHECK (user_id <> peer_id),
    CONSTRAINT chk_recent_kind CHECK (last_kind IN ('chat','call'))
);

CREATE INDEX idx_recent_user_at ON recent_interactions (user_id, last_at DESC);
