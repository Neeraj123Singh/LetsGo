package com.letsgo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UploadBackgroundPayload(
        @NotBlank @Size(max = 120) String label,
        @NotBlank @Size(max = 3_145_728) String dataUrl
) {}
