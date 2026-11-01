package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"personal-finance-manager/backend/internal/auth"
	"personal-finance-manager/backend/internal/finance"
	"personal-finance-manager/backend/internal/supabase"
)

type APIHandler struct {
	keyCache *auth.KeyCache
	sbClient *supabase.Client
}

func NewAPIHandler(kc *auth.KeyCache, sb *supabase.Client) *APIHandler {
	return &APIHandler{
		keyCache: kc,
		sbClient: sb,
	}
}

func (h *APIHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"service": "personal-finance-manager-api",
		"version": "1.0.0",
	})
}

func (h *APIHandler) authenticate(r *http.Request) (*auth.TokenClaims, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, http.ErrNoCookie
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	return h.keyCache.VerifyToken(r.Context(), tokenStr)
}

func (h *APIHandler) SyncPull(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := h.authenticate(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	monthKey := r.URL.Query().Get("month_key")
	if monthKey == "" {
		monthKey = "device_backup"
	}

	snapshot, err := h.sbClient.GetSnapshot(r.Context(), claims.Sub, monthKey)
	if err != nil {
		http.Error(w, `{"error":"failed to pull snapshot"}`, http.StatusInternalServerError)
		return
	}

	if snapshot == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"found":   false,
			"payload": nil,
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"found":      true,
		"user_id":    snapshot.UserID,
		"month_key":  snapshot.MonthKey,
		"updated_at": snapshot.UpdatedAt,
		"payload":    snapshot.Payload,
	})
}

type PushRequest struct {
	MonthKey string                 `json:"month_key"`
	DeviceID string                 `json:"device_id"`
	Payload  map[string]interface{} `json:"payload"`
}

func (h *APIHandler) SyncPush(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := h.authenticate(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req PushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.MonthKey == "" {
		req.MonthKey = "device_backup"
	}

	record := supabase.SnapshotRecord{
		UserID:   claims.Sub,
		MonthKey: req.MonthKey,
		Payload:  req.Payload,
		DeviceID: req.DeviceID,
	}

	if err := h.sbClient.SaveSnapshot(r.Context(), record); err != nil {
		http.Error(w, `{"error":"failed to persist snapshot"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"month_key": req.MonthKey,
	})
}

func (h *APIHandler) Projections(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var state finance.FinancialState
	if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
		http.Error(w, `{"error":"invalid financial state payload"}`, http.StatusBadRequest)
		return
	}

	report := finance.CalculateFinancialMetrics(state)
	json.NewEncoder(w).Encode(report)
}
