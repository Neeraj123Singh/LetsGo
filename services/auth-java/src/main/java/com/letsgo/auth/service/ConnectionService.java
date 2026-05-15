package com.letsgo.auth.service;

import com.letsgo.auth.domain.Connection;
import com.letsgo.auth.domain.ConnectionRequest;
import com.letsgo.auth.domain.User;
import com.letsgo.auth.dto.ConnectionRequestView;
import com.letsgo.auth.dto.ContactView;
import com.letsgo.auth.dto.UserSummary;
import com.letsgo.auth.exception.BadRequestException;
import com.letsgo.auth.exception.ConflictException;
import com.letsgo.auth.exception.NotFoundException;
import com.letsgo.auth.repository.ConnectionRepository;
import com.letsgo.auth.repository.ConnectionRequestRepository;
import com.letsgo.auth.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class ConnectionService {

    private final UserRepository userRepository;
    private final ConnectionRepository connectionRepository;
    private final ConnectionRequestRepository requestRepository;

    public ConnectionService(
            UserRepository userRepository,
            ConnectionRepository connectionRepository,
            ConnectionRequestRepository requestRepository
    ) {
        this.userRepository = userRepository;
        this.connectionRepository = connectionRepository;
        this.requestRepository = requestRepository;
    }

    @Transactional(readOnly = true)
    public List<UserSummary> searchByEmail(UUID viewerId, String emailFragment) {
        String q = emailFragment == null ? "" : emailFragment.trim().toLowerCase(Locale.ROOT);
        if (q.length() < 3) {
            throw new BadRequestException("Type at least 3 characters of the email");
        }
        return userRepository.searchByEmailFragment(q, viewerId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public ConnectionRequestView sendRequest(User me, String targetEmail) {
        String email = targetEmail.trim().toLowerCase(Locale.ROOT);
        User target = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new NotFoundException("No user with that email"));
        if (target.getId().equals(me.getId())) {
            throw new BadRequestException("You cannot connect with yourself");
        }
        Connection.Key key = new Connection.Key(me.getId(), target.getId());
        if (connectionRepository.existsById(key)) {
            throw new ConflictException("You are already connected with " + target.getDisplayName());
        }
        requestRepository.findPendingBetween(me.getId(), target.getId()).ifPresent(existing -> {
            throw new ConflictException("A request between you two is already pending");
        });
        ConnectionRequest req = requestRepository.save(new ConnectionRequest(me.getId(), target.getId()));
        return toRequestView(req, me.getId(), Map.of(
                me.getId(), me,
                target.getId(), target
        ));
    }

    @Transactional(readOnly = true)
    public List<ConnectionRequestView> listRequests(UUID viewerId, String box) {
        String status = ConnectionRequest.Status.pending.name();
        List<ConnectionRequest> raw;
        if ("outgoing".equalsIgnoreCase(box)) {
            raw = requestRepository.findByRequesterIdAndStatusOrderByCreatedAtDesc(viewerId, status);
        } else {
            raw = requestRepository.findByAddresseeIdAndStatusOrderByCreatedAtDesc(viewerId, status);
        }
        Map<UUID, User> users = loadUsers(raw.stream()
                .flatMap(r -> Stream.of(r.getRequesterId(), r.getAddresseeId())));
        return raw.stream().map(r -> toRequestView(r, viewerId, users)).toList();
    }

    @Transactional
    public ConnectionRequestView respond(UUID viewerId, UUID requestId, String action) {
        ConnectionRequest req = requestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("Request not found"));
        switch (action.toLowerCase(Locale.ROOT)) {
            case "accept" -> {
                if (!req.getAddresseeId().equals(viewerId)) {
                    throw new BadRequestException("Only the addressee may accept this request");
                }
                if (req.getStatus() != ConnectionRequest.Status.pending) {
                    throw new ConflictException("Request is no longer pending");
                }
                req.setStatus(ConnectionRequest.Status.accepted);
                connectionRepository.save(new Connection(req.getRequesterId(), req.getAddresseeId()));
            }
            case "decline" -> {
                if (!req.getAddresseeId().equals(viewerId)) {
                    throw new BadRequestException("Only the addressee may decline this request");
                }
                if (req.getStatus() != ConnectionRequest.Status.pending) {
                    throw new ConflictException("Request is no longer pending");
                }
                req.setStatus(ConnectionRequest.Status.declined);
            }
            case "cancel" -> {
                if (!req.getRequesterId().equals(viewerId)) {
                    throw new BadRequestException("Only the requester may cancel this request");
                }
                if (req.getStatus() != ConnectionRequest.Status.pending) {
                    throw new ConflictException("Request is no longer pending");
                }
                req.setStatus(ConnectionRequest.Status.cancelled);
            }
            default -> throw new BadRequestException("Unknown action: " + action);
        }
        Map<UUID, User> users = loadUsers(Stream.of(req.getRequesterId(), req.getAddresseeId()));
        return toRequestView(req, viewerId, users);
    }

    @Transactional(readOnly = true)
    public List<ContactView> listContacts(UUID viewerId) {
        List<Connection> rows = connectionRepository.findAllForUser(viewerId);
        Map<UUID, User> users = loadUsers(rows.stream().map(c -> c.otherUser(viewerId)));
        return rows.stream()
                .map(c -> new ContactView(toSummary(users.get(c.otherUser(viewerId))), c.getCreatedAt()))
                .filter(v -> v.user() != null)
                .toList();
    }

    @Transactional
    public void removeContact(UUID viewerId, UUID peerId) {
        Connection.Key key = new Connection.Key(viewerId, peerId);
        if (!connectionRepository.existsById(key)) {
            throw new NotFoundException("Not connected with that user");
        }
        connectionRepository.deleteById(key);
    }

    @Transactional(readOnly = true)
    public boolean isConnected(UUID a, UUID b) {
        if (a.equals(b)) {
            return false;
        }
        return connectionRepository.existsById(new Connection.Key(a, b));
    }

    private Map<UUID, User> loadUsers(Stream<UUID> ids) {
        List<UUID> idList = ids.distinct().toList();
        if (idList.isEmpty()) {
            return Map.of();
        }
        Map<UUID, User> out = new HashMap<>();
        for (User u : userRepository.findAllById(idList)) {
            out.put(u.getId(), u);
        }
        return out;
    }

    private UserSummary toSummary(User u) {
        if (u == null) return null;
        return new UserSummary(u.getId(), u.getEmail(), u.getDisplayName());
    }

    private ConnectionRequestView toRequestView(ConnectionRequest r, UUID viewerId, Map<UUID, User> users) {
        UserSummary requester = toSummary(users.get(r.getRequesterId()));
        UserSummary addressee = toSummary(users.get(r.getAddresseeId()));
        String direction = r.getRequesterId().equals(viewerId) ? "outgoing" : "incoming";
        return new ConnectionRequestView(
                r.getId(),
                requester,
                addressee,
                r.getStatus().name(),
                direction,
                r.getCreatedAt()
        );
    }
}
