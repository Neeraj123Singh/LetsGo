package com.letsgo.auth.repository;

import com.letsgo.auth.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    @Query("""
        SELECT u FROM User u
        WHERE u.id <> :viewerId
          AND LOWER(u.email) LIKE CONCAT('%', :q, '%')
        ORDER BY u.email ASC
        """)
    List<User> searchByEmailFragment(@Param("q") String q, @Param("viewerId") UUID viewerId);
}
