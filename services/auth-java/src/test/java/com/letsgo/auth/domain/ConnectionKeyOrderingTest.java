package com.letsgo.auth.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Canonical ordering must match PostgreSQL uuid comparison (byte-wise),
 * not Java UUID.compareTo (signed long halves).
 */
class ConnectionKeyOrderingTest {

    @Test
    void key_ordersLexicographically_likePostgres_notLikeSignedUuidCompareTo() {
        UUID a = UUID.fromString("930d4271-bcc2-4d2b-a536-a7e08a3fe8d3"); // Java compares high bits as signed negative
        UUID b = UUID.fromString("7bc967ab-1f12-471c-a27d-cabae9e9bba5");

        Connection.Key key = new Connection.Key(a, b);
        assertEquals(b, key.getUserLowId());
        assertEquals(a, key.getUserHighId());
    }

    @Test
    void key_symmetricRegardlessOfArgumentOrder() {
        UUID x = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        UUID y = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        Connection.Key k1 = new Connection.Key(x, y);
        Connection.Key k2 = new Connection.Key(y, x);
        assertEquals(k1.getUserLowId(), k2.getUserLowId());
        assertEquals(k1.getUserHighId(), k2.getUserHighId());
    }
}
