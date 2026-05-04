package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid token")

// ParseUserID validates HS256 JWT (same contract as auth-java: subject = user UUID).
func ParseUserID(tokenString string, secret string) (string, error) {
	if len(secret) < 32 {
		return "", fmt.Errorf("jwt secret must be at least 32 bytes")
	}
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", ErrInvalidToken
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return "", ErrInvalidToken
	}
	return sub, nil
}
