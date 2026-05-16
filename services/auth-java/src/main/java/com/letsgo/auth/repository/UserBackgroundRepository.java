package com.letsgo.auth.repository;

import com.letsgo.auth.domain.UserBackground;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserBackgroundRepository extends JpaRepository<UserBackground, UUID> {

    List<UserBackground> findByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserId(UUID userId);
}
