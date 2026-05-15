package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DirectMessage is a 1:1 chat row.
type DirectMessage struct {
	ID          string    `json:"id"`
	SenderID    string    `json:"senderId"`
	RecipientID string    `json:"recipientId"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RoomMessage is an in-meeting chat row tied to a roomId.
type RoomMessage struct {
	ID        string    `json:"id"`
	RoomID    string    `json:"roomId"`
	SenderID  string    `json:"senderId"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

// InsertDirectMessage persists a DM and returns the populated row.
func InsertDirectMessage(ctx context.Context, pool *pgxpool.Pool, senderID, recipientID, body string) (*DirectMessage, error) {
	const q = `
		INSERT INTO direct_messages (sender_id, recipient_id, body)
		VALUES ($1::uuid, $2::uuid, $3)
		RETURNING id::text, sender_id::text, recipient_id::text, body, created_at
	`
	var row DirectMessage
	err := pool.QueryRow(ctx, q, senderID, recipientID, body).
		Scan(&row.ID, &row.SenderID, &row.RecipientID, &row.Body, &row.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// ListDirectMessages returns messages between two users, newest first.
// `before` may be zero to mean "no upper bound".
func ListDirectMessages(ctx context.Context, pool *pgxpool.Pool, a, b string, before time.Time, limit int) ([]DirectMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	const q = `
		SELECT id::text, sender_id::text, recipient_id::text, body, created_at
		FROM direct_messages
		WHERE ((sender_id = $1::uuid AND recipient_id = $2::uuid)
		    OR (sender_id = $2::uuid AND recipient_id = $1::uuid))
		  AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
		ORDER BY created_at DESC
		LIMIT $4
	`
	var beforeArg any
	if before.IsZero() {
		beforeArg = nil
	} else {
		beforeArg = before
	}
	rows, err := pool.Query(ctx, q, a, b, beforeArg, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]DirectMessage, 0)
	for rows.Next() {
		var r DirectMessage
		if err := rows.Scan(&r.ID, &r.SenderID, &r.RecipientID, &r.Body, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func InsertRoomMessage(ctx context.Context, pool *pgxpool.Pool, roomID, senderID, body string) (*RoomMessage, error) {
	const q = `
		INSERT INTO room_messages (room_id, sender_id, body)
		VALUES ($1, $2::uuid, $3)
		RETURNING id::text, room_id, sender_id::text, body, created_at
	`
	var row RoomMessage
	err := pool.QueryRow(ctx, q, roomID, senderID, body).
		Scan(&row.ID, &row.RoomID, &row.SenderID, &row.Body, &row.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func ListRoomMessages(ctx context.Context, pool *pgxpool.Pool, roomID string, limit int) ([]RoomMessage, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	const q = `
		SELECT id::text, room_id, sender_id::text, body, created_at
		FROM room_messages
		WHERE room_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`
	rows, err := pool.Query(ctx, q, roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]RoomMessage, 0)
	for rows.Next() {
		var r RoomMessage
		if err := rows.Scan(&r.ID, &r.RoomID, &r.SenderID, &r.Body, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AreConnected checks the connections table (which is owned by auth-java but we
// can read it from the same DB).
func AreConnected(ctx context.Context, pool *pgxpool.Pool, a, b string) (bool, error) {
	if a == b {
		return false, nil
	}
	const q = `
		SELECT 1 FROM connections
		WHERE (user_low_id = LEAST($1::uuid, $2::uuid)
		   AND user_high_id = GREATEST($1::uuid, $2::uuid))
		LIMIT 1
	`
	var x int
	err := pool.QueryRow(ctx, q, a, b).Scan(&x)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// TouchRecentInteraction upserts the (user, peer) recent interaction surface.
func TouchRecentInteraction(ctx context.Context, pool *pgxpool.Pool, userID, peerID, kind string) error {
	if userID == peerID {
		return nil
	}
	const q = `
		INSERT INTO recent_interactions (user_id, peer_id, last_kind, last_at)
		VALUES ($1::uuid, $2::uuid, $3, now())
		ON CONFLICT (user_id, peer_id)
		DO UPDATE SET last_kind = EXCLUDED.last_kind, last_at = EXCLUDED.last_at
	`
	_, err := pool.Exec(ctx, q, userID, peerID, kind)
	return err
}

type RecentEntry struct {
	UserID      string    `json:"userId"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	LastKind    string    `json:"lastKind"`
	LastAt      time.Time `json:"lastAt"`
}

func ListRecentInteractions(ctx context.Context, pool *pgxpool.Pool, userID string, limit int) ([]RecentEntry, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	const q = `
		SELECT u.id::text, u.email, u.display_name, r.last_kind, r.last_at
		FROM recent_interactions r
		JOIN users u ON u.id = r.peer_id
		WHERE r.user_id = $1::uuid
		ORDER BY r.last_at DESC
		LIMIT $2
	`
	rows, err := pool.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RecentEntry
	for rows.Next() {
		var r RecentEntry
		if err := rows.Scan(&r.UserID, &r.Email, &r.DisplayName, &r.LastKind, &r.LastAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
