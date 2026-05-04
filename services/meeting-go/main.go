package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"letsgo/meeting/internal/hub"
	"letsgo/meeting/internal/server"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://letsgo:letsgo@localhost:5432/letsgo?sslmode=disable"
	}
	secret := os.Getenv("LETSGO_JWT_SECRET")
	if secret == "" {
		secret = "changeme-letsgo-dev-secret-32chars-min!!"
	}
	if len(secret) < 32 {
		log.Fatal("LETSGO_JWT_SECRET must be at least 32 bytes (match auth-java)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	pool, err := pgxpool.New(ctx, dsn)
	cancel()
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	addr := ":8081"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}

	h := hub.New()
	srv := server.New(pool, h, secret)
	log.Printf("meeting-go listening on %s", addr)
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
