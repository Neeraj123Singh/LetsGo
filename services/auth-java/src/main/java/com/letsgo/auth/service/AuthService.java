package com.letsgo.auth.service;

import com.letsgo.auth.domain.User;
import com.letsgo.auth.dto.AuthResponse;
import com.letsgo.auth.dto.LoginRequest;
import com.letsgo.auth.dto.RegisterRequest;
import com.letsgo.auth.exception.ConflictException;
import com.letsgo.auth.exception.UnauthorizedException;
import com.letsgo.auth.repository.UserRepository;
import com.letsgo.auth.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("Email already registered");
        }
        User user = new User(
                email,
                passwordEncoder.encode(request.password()),
                request.displayName().trim()
        );
        userRepository.save(user);
        String token = jwtService.generateToken(user.getId());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getDisplayName());
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }
        String token = jwtService.generateToken(user.getId());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getDisplayName());
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
