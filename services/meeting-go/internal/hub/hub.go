package hub

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"
)

// Client is a WebSocket in a video room (mesh signaling).
type Client struct {
	Hub          *Hub
	RoomID       string
	UserID       string
	Email        string
	DisplayName  string
	Conn         *websocket.Conn
	writeMu      sync.Mutex
}

// NotifyClient receives invites / call signals while on the app (not necessarily in a room).
type NotifyClient struct {
	Hub         *Hub
	UserID      string
	Email       string
	DisplayName string
	Conn        *websocket.Conn
	writeMu     sync.Mutex
}

type Hub struct {
	mu sync.Mutex
	// presence counts any active room or notify socket for a user (used for lookup "online").
	presence map[string]int
	rooms    map[string]map[string][]*Client // roomId -> userId -> room connections
	notifies map[string][]*NotifyClient     // userId -> notify connections
	// pendingInvites maps callId -> caller user id (for decline routing).
	pendingInvites map[string]string
}

func New() *Hub {
	return &Hub{
		presence:       make(map[string]int),
		rooms:          make(map[string]map[string][]*Client),
		notifies:       make(map[string][]*NotifyClient),
		pendingInvites: make(map[string]string),
	}
}

func (h *Hub) bumpPresence(userID string) {
	h.presence[userID]++
}

func (h *Hub) dropPresence(userID string) {
	if h.presence[userID] > 0 {
		h.presence[userID]--
		if h.presence[userID] == 0 {
			delete(h.presence, userID)
		}
	}
}

func (h *Hub) IsUserOnline(userID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.presence[userID] > 0
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.bumpPresence(c.UserID)
	room, ok := h.rooms[c.RoomID]
	if !ok {
		room = make(map[string][]*Client)
		h.rooms[c.RoomID] = room
	}
	room[c.UserID] = append(room[c.UserID], c)
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.dropPresence(c.UserID)
	room, ok := h.rooms[c.RoomID]
	if !ok {
		return
	}
	list := room[c.UserID]
	for i, x := range list {
		if x == c {
			room[c.UserID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(room[c.UserID]) == 0 {
		delete(room, c.UserID)
	}
	if len(room) == 0 {
		delete(h.rooms, c.RoomID)
	}
}

func (h *Hub) RegisterNotify(c *NotifyClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.bumpPresence(c.UserID)
	h.notifies[c.UserID] = append(h.notifies[c.UserID], c)
}

func (h *Hub) UnregisterNotify(c *NotifyClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.dropPresence(c.UserID)
	list := h.notifies[c.UserID]
	for i, x := range list {
		if x == c {
			h.notifies[c.UserID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(h.notifies[c.UserID]) == 0 {
		delete(h.notifies, c.UserID)
	}
}

func (h *Hub) SendNotifyToUser(userID string, msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.notifies[userID] {
		notifyWrite(c, msg)
	}
}

func notifyWrite(c *NotifyClient, data []byte) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.Conn.WriteMessage(websocket.TextMessage, data)
}

func (h *Hub) RememberInvite(callID, callerUserID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pendingInvites[callID] = callerUserID
}

func (h *Hub) TakeInviteCaller(callID string) (caller string, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	caller, ok = h.pendingInvites[callID]
	if ok {
		delete(h.pendingInvites, callID)
	}
	return caller, ok
}

func (h *Hub) PeekInviteCaller(callID string) (caller string, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	caller, ok = h.pendingInvites[callID]
	return caller, ok
}

func (h *Hub) ForgetInvite(callID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.pendingInvites, callID)
}

// Roster returns other participants in the room (excluding newJoiner).
func (h *Hub) Roster(roomID string, excludeUserID string) []Participant {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[roomID]
	if !ok {
		return nil
	}
	var out []Participant
	for uid, clients := range room {
		if uid == excludeUserID || len(clients) == 0 {
			continue
		}
		c0 := clients[0]
		out = append(out, Participant{UserID: uid, Email: c0.Email, DisplayName: c0.DisplayName})
	}
	return out
}

type Participant struct {
	UserID      string `json:"userId"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

func (h *Hub) SendToUser(roomID, targetUserID string, msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	for _, c := range room[targetUserID] {
		c.write(msg)
	}
}

func (h *Hub) BroadcastExcept(roomID, excludeUserID string, msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	for uid, clients := range room {
		if uid == excludeUserID {
			continue
		}
		for _, c := range clients {
			c.write(msg)
		}
	}
}

func (c *Client) write(data []byte) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.Conn.WriteMessage(websocket.TextMessage, data)
}

func JSON(kind string, fields map[string]any) []byte {
	m := map[string]any{"kind": kind}
	for k, v := range fields {
		m[k] = v
	}
	b, _ := json.Marshal(m)
	return b
}
