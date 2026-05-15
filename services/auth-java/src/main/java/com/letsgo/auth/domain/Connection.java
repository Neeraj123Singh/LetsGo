package com.letsgo.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "connections")
public class Connection {

    @Embeddable
    public static class Key implements Serializable {

        @Column(name = "user_low_id", nullable = false)
        private UUID userLowId;

        @Column(name = "user_high_id", nullable = false)
        private UUID userHighId;

        public Key() {}

        public Key(UUID a, UUID b) {
            // NB: must match Postgres' byte-wise (unsigned) UUID ordering, NOT
            // Java's signed UUID.compareTo. Comparing the lowercase hex strings
            // gives the same total order as Postgres uses for the
            // chk_connection_order check constraint.
            if (a.toString().compareTo(b.toString()) < 0) {
                this.userLowId = a;
                this.userHighId = b;
            } else {
                this.userLowId = b;
                this.userHighId = a;
            }
        }

        public UUID getUserLowId() { return userLowId; }
        public UUID getUserHighId() { return userHighId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key k)) return false;
            return Objects.equals(userLowId, k.userLowId) && Objects.equals(userHighId, k.userHighId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userLowId, userHighId);
        }
    }

    @EmbeddedId
    private Key id;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Connection() {}

    public Connection(UUID a, UUID b) {
        this.id = new Key(a, b);
    }

    public Key getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }

    /** The peer of {@code self} in this connection. */
    public UUID otherUser(UUID self) {
        return self.equals(id.userLowId) ? id.userHighId : id.userLowId;
    }
}
