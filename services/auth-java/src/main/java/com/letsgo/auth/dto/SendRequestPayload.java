package com.letsgo.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record SendRequestPayload(@NotBlank @Email String email) {
}
