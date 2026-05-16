package com.letsgo.auth.service;

import com.letsgo.auth.dto.UploadBackgroundPayload;
import com.letsgo.auth.exception.BadRequestException;
import com.letsgo.auth.exception.ConflictException;
import com.letsgo.auth.repository.UserBackgroundRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserBackgroundServiceTest {

    @Mock
    UserBackgroundRepository repo;

    @InjectMocks
    UserBackgroundService service;

    UUID userId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
    }

    @Test
    void upload_rejectsNonDataUrl() {
        assertThrows(BadRequestException.class, () ->
                service.upload(userId, new UploadBackgroundPayload("x", "https://example.com/x.png")));
        verify(repo, never()).save(any());
    }

    @Test
    void upload_rejectsWhenAtCap() {
        when(repo.countByUserId(userId)).thenReturn(24L);
        String minimalPng =
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        assertThrows(ConflictException.class, () ->
                service.upload(userId, new UploadBackgroundPayload("bg", minimalPng)));
    }
}
