CREATE TABLE connection_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_request_status CHECK (status IN ('pending','accepted','declined','cancelled')),
    CONSTRAINT chk_request_not_self CHECK (requester_id <> addressee_id)
);

-- A pair of users may have at most one pending request (in either direction).
CREATE UNIQUE INDEX uq_connection_requests_pending_pair
ON connection_requests (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
WHERE status = 'pending';

CREATE INDEX idx_connection_requests_requester ON connection_requests (requester_id, status, created_at DESC);
CREATE INDEX idx_connection_requests_addressee ON connection_requests (addressee_id, status, created_at DESC);

-- Accepted contacts. Stored once per pair with user_low < user_high so we
-- never have two rows for the same friendship.
CREATE TABLE connections (
    user_low_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_low_id, user_high_id),
    CONSTRAINT chk_connection_order CHECK (user_low_id < user_high_id)
);

CREATE INDEX idx_connections_low  ON connections (user_low_id);
CREATE INDEX idx_connections_high ON connections (user_high_id);
