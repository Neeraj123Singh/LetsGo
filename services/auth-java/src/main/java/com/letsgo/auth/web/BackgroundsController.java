package com.letsgo.auth.web;

import com.letsgo.auth.domain.User;
import com.letsgo.auth.dto.BackgroundView;
import com.letsgo.auth.dto.UploadBackgroundPayload;
import com.letsgo.auth.service.UserBackgroundService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users/me/backgrounds")
public class BackgroundsController {

    private final UserBackgroundService service;

    public BackgroundsController(UserBackgroundService service) {
        this.service = service;
    }

    @GetMapping
    public List<BackgroundView> list(@AuthenticationPrincipal User me) {
        return service.list(me.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BackgroundView upload(
            @AuthenticationPrincipal User me,
            @Valid @RequestBody UploadBackgroundPayload payload
    ) {
        return service.upload(me.getId(), payload);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        service.delete(me.getId(), id);
    }
}
