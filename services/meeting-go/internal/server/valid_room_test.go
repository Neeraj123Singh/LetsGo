package server

import (
	"strings"
	"testing"
)

func TestValidRoomID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"short", false},
		{"abcd1234", true},
		{"Room_With-Chars09ok", true},
		{"has space", false},
		{"bad!", false},
		{strings.Repeat("a", 129), false},
	}
	for _, tt := range tests {
		if got := validRoomID(tt.id); got != tt.valid {
			t.Fatalf("validRoomID(%q)=%v want %v", tt.id, got, tt.valid)
		}
	}
}
