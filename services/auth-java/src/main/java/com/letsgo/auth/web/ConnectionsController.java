package com.letsgo.auth.web;

import com.letsgo.auth.domain.User;
import com.letsgo.auth.dto.ConnectionRequestView;
import com.letsgo.auth.dto.ContactView;
import com.letsgo.auth.dto.SendRequestPayload;
import com.letsgo.auth.service.ConnectionService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/connections")
public class ConnectionsController {

    private static final Logger log = LoggerFactory.getLogger(ConnectionsController.class);

    private final ConnectionService service;

    public ConnectionsController(ConnectionService service) {
        this.service = service;
    }

    @GetMapping
    public List<ContactView> listContacts(@AuthenticationPrincipal User me) {
        return service.listContacts(me.getId());
    }

    @DeleteMapping("/{peerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeContact(@AuthenticationPrincipal User me, @PathVariable UUID peerId) {
        service.removeContact(me.getId(), peerId);
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public ConnectionRequestView sendRequest(
            @AuthenticationPrincipal User me,
            @Valid @RequestBody SendRequestPayload payload
    ) {
        return service.sendRequest(me, payload.email());
    }

    @GetMapping("/requests")
    public List<ConnectionRequestView> listRequests(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "incoming") String box
    ) {
        return service.listRequests(me.getId(), box);
    }

    @PostMapping("/requests/{requestId}/{action}")
    public ResponseEntity<ConnectionRequestView> respond(
            @AuthenticationPrincipal User me,
            @PathVariable UUID requestId,
            @PathVariable String action
    ) {
        log.info("connection request respond: viewer={} requestId={} action={}",
                me != null ? me.getId() : null, requestId, action);
        return ResponseEntity.ok(service.respond(me.getId(), requestId, action));
    }
}
