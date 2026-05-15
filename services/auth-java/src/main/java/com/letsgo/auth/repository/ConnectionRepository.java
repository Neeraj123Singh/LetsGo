package com.letsgo.auth.repository;

import com.letsgo.auth.domain.Connection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ConnectionRepository extends JpaRepository<Connection, Connection.Key> {

    @Query("""
        SELECT c FROM Connection c
        WHERE c.id.userLowId = :userId OR c.id.userHighId = :userId
        ORDER BY c.createdAt DESC
        """)
    List<Connection> findAllForUser(@Param("userId") UUID userId);

    boolean existsById(Connection.Key key);
}
