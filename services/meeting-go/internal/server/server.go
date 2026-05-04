package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"

	"letsgo/meeting/internal/auth"
	"letsgo/meeting/internal/hub"
	"letsgo/meeting/internal/store"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	Pool   *pgxpool.Pool
	Hub    *hub.Hub
	Secret string
	Origins map[string]bool
}

func New(pool *pgxpool.Pool, h *hub.Hub, secret string) *Server {
	origins := map[string]bool{}
	raw := os.Getenv("CORS_ALLOWED_ORIGINS")
	if raw == "" {
		raw = "http://localhost:3000,http://localhost:5173"
	}
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins[o] = true
		}
	}
	return &Server{Pool: pool, Hub: h, Secret: secret, Origins: origins}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.Origins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return ""
	}
	return strings.TrimSpace(h[7:])
}

func (s *Server) LookupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tok := bearerToken(r)
	if tok == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if _, err := auth.ParseUserID(tok, s.Secret); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	row, err := store.LookupUserByEmail(ctx, s.Pool, email)
	if err != nil {
		log.Printf("lookup db: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if row == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	online := s.Hub.IsUserOnline(row.ID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"userId":      row.ID,
		"email":       row.Email,
		"displayName": row.DisplayName,
		"online":      online,
	})
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // validated via JWT; origin checked in handshake via header if needed
	},
}

func validRoomID(id string) bool {
	id = strings.TrimSpace(id)
	if len(id) < 8 || len(id) > 128 {
		return false
	}
	for _, r := range id {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}

func (s *Server) RoomWS(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	roomID := strings.TrimSpace(r.URL.Query().Get("roomId"))
	if token == "" || !validRoomID(roomID) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	userID, err := auth.ParseUserID(token, s.Secret)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	row, err := store.LookupUserByID(ctx, s.Pool, userID)
	if err != nil || row == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &hub.Client{
		Hub:         s.Hub,
		RoomID:      roomID,
		UserID:      row.ID,
		Email:       row.Email,
		DisplayName: row.DisplayName,
		Conn:        conn,
	}
	s.Hub.Register(client)

	roster := s.Hub.Roster(roomID, row.ID)
	_ = conn.WriteMessage(websocket.TextMessage, hub.JSON("room-roster", map[string]any{
		"roomId":       roomID,
		"participants": roster,
	}))
	s.Hub.BroadcastExcept(roomID, row.ID, hub.JSON("peer-joined", map[string]any{
		"roomId":      roomID,
		"userId":      row.ID,
		"email":       row.Email,
		"displayName": row.DisplayName,
	}))

	defer func() {
		s.Hub.Unregister(client)
		s.Hub.BroadcastExcept(roomID, row.ID, hub.JSON("peer-left", map[string]any{
			"roomId": roomID,
			"userId": row.ID,
		}))
		_ = conn.Close()
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		kind, _ := msg["kind"].(string)
		target, _ := msg["targetUserId"].(string)
		switch kind {
		case "webrtc-offer", "webrtc-answer", "webrtc-ice":
			if target == "" || target == row.ID {
				continue
			}
			out := map[string]any{
				"kind":         kind,
				"roomId":       roomID,
				"fromUserId":   row.ID,
				"fromEmail":    row.Email,
				"fromDisplayName": row.DisplayName,
				"targetUserId": target,
			}
			if sdp, ok := msg["sdp"].(string); ok {
				out["sdp"] = sdp
			}
			if c, ok := msg["candidate"].(string); ok {
				out["candidate"] = c
			}
			if mid, ok := msg["sdpMid"].(string); ok {
				out["sdpMid"] = mid
			}
			if idx, ok := msg["sdpMLineIndex"].(float64); ok {
				out["sdpMLineIndex"] = idx
			}
			b, _ := json.Marshal(out)
			s.Hub.SendToUser(roomID, target, b)
		default:
			// ignore unknown
		}
	}
}

func (s *Server) NotifyWS(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	userID, err := auth.ParseUserID(token, s.Secret)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	row, err := store.LookupUserByID(ctx, s.Pool, userID)
	if err != nil || row == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	nc := &hub.NotifyClient{
		Hub:         s.Hub,
		UserID:      row.ID,
		Email:       row.Email,
		DisplayName: row.DisplayName,
		Conn:        conn,
	}
	s.Hub.RegisterNotify(nc)
	defer func() {
		s.Hub.UnregisterNotify(nc)
		_ = conn.Close()
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		kind, _ := msg["kind"].(string)
		switch kind {
		case "invite":
			targetEmail, _ := msg["targetEmail"].(string)
			roomID, _ := msg["roomId"].(string)
			callID, _ := msg["callId"].(string)
			targetEmail = strings.TrimSpace(strings.ToLower(targetEmail))
			if targetEmail == "" || !validRoomID(roomID) || len(callID) < 8 {
				s.Hub.SendNotifyToUser(row.ID, hub.JSON("invite-error", map[string]any{
					"message": "targetEmail, roomId, and callId are required",
				}))
				continue
			}
			tctx, tcancel := context.WithTimeout(context.Background(), 5*time.Second)
			target, err := store.LookupUserByEmail(tctx, s.Pool, targetEmail)
			tcancel()
			if err != nil {
				log.Printf("invite lookup: %v", err)
				s.Hub.SendNotifyToUser(row.ID, hub.JSON("invite-error", map[string]any{"message": "Lookup failed"}))
				continue
			}
			if target == nil {
				s.Hub.SendNotifyToUser(row.ID, hub.JSON("invite-error", map[string]any{"message": "No user with that email"}))
				continue
			}
			if strings.EqualFold(target.Email, row.Email) {
				s.Hub.SendNotifyToUser(row.ID, hub.JSON("invite-error", map[string]any{"message": "Cannot invite yourself"}))
				continue
			}
			if !s.Hub.IsUserOnline(target.ID) {
				s.Hub.SendNotifyToUser(row.ID, hub.JSON("invite-error", map[string]any{"message": "User is offline"}))
				continue
			}
			s.Hub.RememberInvite(callID, row.ID)
			s.Hub.SendNotifyToUser(target.ID, hub.JSON("incoming-call", map[string]any{
				"callId":          callID,
				"roomId":          roomID,
				"fromUserId":      row.ID,
				"fromEmail":       row.Email,
				"fromDisplayName": row.DisplayName,
			}))
		case "invite-decline":
			callID, _ := msg["callId"].(string)
			if callID == "" {
				continue
			}
			caller, ok := s.Hub.TakeInviteCaller(callID)
			if ok {
				s.Hub.SendNotifyToUser(caller, hub.JSON("invite-declined", map[string]any{
					"callId": callID,
				}))
			}
		case "invite-accepted":
			callID, _ := msg["callId"].(string)
			if callID == "" {
				continue
			}
			caller, ok := s.Hub.PeekInviteCaller(callID)
			if ok {
				s.Hub.SendNotifyToUser(caller, hub.JSON("invite-accepted", map[string]any{
					"callId": callID,
				}))
				s.Hub.ForgetInvite(callID)
			}
		default:
			// ignore
		}
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /meeting/api/v1/users/lookup", s.LookupHandler)
	mux.HandleFunc("GET /meeting/ws/v1/room", s.RoomWS)
	mux.HandleFunc("GET /meeting/ws/v1/notify", s.NotifyWS)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return s.cors(mux)
}
