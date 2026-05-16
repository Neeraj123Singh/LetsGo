package com.letsgo.auth.service;

import com.letsgo.auth.domain.UserBackground;
import com.letsgo.auth.dto.BackgroundView;
import com.letsgo.auth.dto.UploadBackgroundPayload;
import com.letsgo.auth.exception.BadRequestException;
import com.letsgo.auth.exception.ConflictException;
import com.letsgo.auth.exception.NotFoundException;
import com.letsgo.auth.repository.UserBackgroundRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class UserBackgroundService {

    /** Cap matches the SQL CHECK constraint; safety belt at the app layer. */
    private static final int MAX_DATA_URL_LEN = 3_145_728;
    private static final int MAX_PER_USER = 24;

    private static final Pattern DATA_URL_RE =
            Pattern.compile("^data:(image/(?:jpeg|png|webp|gif));base64,[A-Za-z0-9+/=]+$");

    private static final Set<String> ALLOWED_MIME = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif"
    );

    private final UserBackgroundRepository repo;

    public UserBackgroundService(UserBackgroundRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public List<BackgroundView> list(UUID userId) {
        return repo.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(UserBackgroundService::toView)
                .toList();
    }

    @Transactional
    public BackgroundView upload(UUID userId, UploadBackgroundPayload payload) {
        if (payload == null || payload.dataUrl() == null) {
            throw new BadRequestException("Missing image data");
        }
        String url = payload.dataUrl().trim();
        if (url.length() > MAX_DATA_URL_LEN) {
            throw new BadRequestException("Image too large (max ~2 MB)");
        }
        Matcher m = DATA_URL_RE.matcher(url);
        if (!m.matches()) {
            throw new BadRequestException("Only base64-encoded JPEG/PNG/WebP/GIF data URLs are allowed");
        }
        String mime = m.group(1);
        if (!ALLOWED_MIME.contains(mime)) {
            throw new BadRequestException("Unsupported image type: " + mime);
        }
        String label = payload.label() == null ? "" : payload.label().trim();
        if (label.isEmpty()) label = "Background";
        if (label.length() > 120) label = label.substring(0, 120);

        long existing = repo.countByUserId(userId);
        if (existing >= MAX_PER_USER) {
            throw new ConflictException("You already have " + MAX_PER_USER
                    + " saved backgrounds — delete one before uploading more.");
        }
        UserBackground saved = repo.save(new UserBackground(userId, label, mime, url));
        return toView(saved);
    }

    @Transactional
    public void delete(UUID userId, UUID backgroundId) {
        UserBackground bg = repo.findById(backgroundId)
                .orElseThrow(() -> new NotFoundException("Background not found"));
        if (!bg.getUserId().equals(userId)) {
            throw new NotFoundException("Background not found");
        }
        repo.delete(bg);
    }

    private static BackgroundView toView(UserBackground bg) {
        return new BackgroundView(
                bg.getId(),
                bg.getLabel(),
                bg.getMimeType(),
                bg.getDataUrl(),
                bg.getCreatedAt()
        );
    }
}
