package com.letsgo.auth.repository;

import com.letsgo.auth.domain.ConnectionRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConnectionRequestRepository extends JpaRepository<ConnectionRequest, UUID> {

    @Query("""
        SELECT r FROM ConnectionRequest r
        WHERE r.status = 'pending'
          AND ((r.requesterId = :a AND r.addresseeId = :b)
               OR (r.requesterId = :b AND r.addresseeId = :a))
        """)
    Optional<ConnectionRequest> findPendingBetween(UUID a, UUID b);

    List<ConnectionRequest> findByAddresseeIdAndStatusOrderByCreatedAtDesc(UUID addresseeId, String status);

    List<ConnectionRequest> findByRequesterIdAndStatusOrderByCreatedAtDesc(UUID requesterId, String status);
}
