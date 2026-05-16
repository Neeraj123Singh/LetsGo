package auth

import (
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseUserID_validHS256(t *testing.T) {
	secret := strings.Repeat("s", 32)
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "550e8400-e29b-41d4-a716-446655440000",
	})
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	got, err := ParseUserID(signed, secret)
	if err != nil {
		t.Fatalf("ParseUserID: %v", err)
	}
	if got != "550e8400-e29b-41d4-a716-446655440000" {
		t.Fatalf("sub mismatch: %q", got)
	}
}

func TestParseUserID_shortSecret(t *testing.T) {
	_, err := ParseUserID("x", "short")
	if err == nil {
		t.Fatal("expected error for secret < 32 bytes")
	}
}

func TestParseUserID_badToken(t *testing.T) {
	secret := strings.Repeat("z", 32)
	_, err := ParseUserID("not.a.jwt", secret)
	if err != ErrInvalidToken {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}
