package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"personal-finance-manager/backend/internal/auth"
	"personal-finance-manager/backend/internal/handlers"
	"personal-finance-manager/backend/internal/supabase"
)

func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
			if os.Getenv(k) == "" {
				os.Setenv(k, v)
			}
		}
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	loadEnvFile("../.env.local")
	loadEnvFile(".env")
	loadEnvFile("../.env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	sbURL := os.Getenv("SUPABASE_URL")
	sbSecret := os.Getenv("SUPABASE_SECRET_KEY")
	sbPub := os.Getenv("SUPABASE_PUBLISHABLE_KEY")
	jwksURL := os.Getenv("SUPABASE_JWKS_URL")

	if jwksURL == "" && sbURL != "" {
		jwksURL = sbURL + "/auth/v1/.well-known/jwks.json"
	}

	log.Printf("Starting Personal Finance Manager Go API on port %s", port)
	log.Printf("Configured Supabase: %s", sbURL)

	keyCache := auth.NewKeyCache(jwksURL)
	sbClient := supabase.NewClient(sbURL, sbSecret, sbPub)
	api := handlers.NewAPIHandler(keyCache, sbClient)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", api.Health)
	mux.HandleFunc("GET /api/v1/sync/pull", api.SyncPull)
	mux.HandleFunc("POST /api/v1/sync/push", api.SyncPush)
	mux.HandleFunc("POST /api/v1/projections", api.Projections)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	log.Println("Server exited")
}
