package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"letsgo/meeting/internal/hub"
	"letsgo/meeting/internal/store"
)

const maxMessageBytes = 4000

// DmHistoryHandler — GET /meeting/api/v1/messages/dm?peerId=...&before=...&limit=...
func (s *Server) DmHistoryHandler(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authed(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	peerID := strings.TrimSpace(r.URL.Query().Get("peerId"))
	if peerID == "" {
		http.Error(w, "peerId required", http.StatusBadRequest)
		return
	}
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	var before time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339Nano, b); err == nil {
			before = t
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := store.ListDirectMessages(ctx, s.Pool, uid, peerID, before, limit)
	if err != nil {
		log.Printf("dm history: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []store.DirectMessage{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": rows})
}

// dmSendHandler — POST /meeting/api/v1/messages/dm  {peerId, body}
// Sender is the JWT subject. Recipient must be a confirmed connection.
// Also pushes the new message to the recipient's notify socket(s) if online.
func (s *Server) DmSendHandler(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authed(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		PeerID string `json:"peerId"`
		Body   string `json:"body"`
	}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, maxMessageBytes+512))
	if err := json.Unmarshal(raw, &body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	peerID := strings.TrimSpace(body.PeerID)
	msg := strings.TrimSpace(body.Body)
	if peerID == "" || msg == "" {
		http.Error(w, "peerId and body required", http.StatusBadRequest)
		return
	}
	if len(msg) > maxMessageBytes {
		http.Error(w, "message too long", http.StatusBadRequest)
		return
	}
	if peerID == uid {
		http.Error(w, "cannot message yourself", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	connected, err := store.AreConnected(ctx, s.Pool, uid, peerID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !connected {
		http.Error(w, "not connected with that user", http.StatusForbidden)
		return
	}
	row, err := store.InsertDirectMessage(ctx, s.Pool, uid, peerID, msg)
	if err != nil {
		log.Printf("dm insert: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Best-effort: update recent surface for both sides.
	go func() {
		bg, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = store.TouchRecentInteraction(bg, s.Pool, uid, peerID, "chat")
		_ = store.TouchRecentInteraction(bg, s.Pool, peerID, uid, "chat")
	}()
	// Notify both sides so any open chat view updates live.
	push := hub.JSON("chat-dm", map[string]any{
		"id":          row.ID,
		"senderId":    row.SenderID,
		"recipientId": row.RecipientID,
		"body":        row.Body,
		"createdAt":   row.CreatedAt,
	})
	s.Hub.SendNotifyToUser(peerID, push)
	s.Hub.SendNotifyToUser(uid, push)
	writeJSON(w, http.StatusCreated, row)
}

// RoomChatHistoryHandler — GET /meeting/api/v1/messages/room?roomId=...
func (s *Server) RoomChatHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authed(r); !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	roomID := strings.TrimSpace(r.URL.Query().Get("roomId"))
	if !validRoomID(roomID) {
		http.Error(w, "roomId required", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := store.ListRoomMessages(ctx, s.Pool, roomID, 200)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []store.RoomMessage{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": rows})
}

// RecentHandler — GET /meeting/api/v1/recent  — list of peers the user has
// recently called or chatted with, for the dashboard carousel.
func (s *Server) RecentHandler(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authed(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := store.ListRecentInteractions(ctx, s.Pool, uid, 20)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []store.RecentEntry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"recents": rows})
}

// MarkCallHandler — POST /meeting/api/v1/recent/touch  {peerId, kind}
// Used by the frontend right before placing a call so it shows up in recents.
func (s *Server) MarkCallHandler(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authed(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		PeerID string `json:"peerId"`
		Kind   string `json:"kind"`
	}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, 1024))
	if err := json.Unmarshal(raw, &body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	kind := strings.ToLower(strings.TrimSpace(body.Kind))
	if kind != "call" && kind != "chat" {
		kind = "call"
	}
	if body.PeerID == "" {
		http.Error(w, "peerId required", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := store.TouchRecentInteraction(ctx, s.Pool, uid, body.PeerID, kind); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Symmetric: the peer also sees us in their recents.
	go func() {
		bg, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = store.TouchRecentInteraction(bg, s.Pool, body.PeerID, uid, kind)
	}()
	w.WriteHeader(http.StatusNoContent)
}
