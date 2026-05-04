package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRow struct {
	ID          string
	Email       string
	DisplayName string
}

func LookupUserByEmail(ctx context.Context, pool *pgxpool.Pool, email string) (*UserRow, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil, nil
	}
	const q = `SELECT id::text, email, display_name FROM users WHERE lower(trim(email)) = $1 LIMIT 1`
	var row UserRow
	err := pool.QueryRow(ctx, q, email).Scan(&row.ID, &row.Email, &row.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func LookupUserByID(ctx context.Context, pool *pgxpool.Pool, userID string) (*UserRow, error) {
	const q = `SELECT id::text, email, display_name FROM users WHERE id = $1::uuid LIMIT 1`
	var row UserRow
	err := pool.QueryRow(ctx, q, userID).Scan(&row.ID, &row.Email, &row.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}
