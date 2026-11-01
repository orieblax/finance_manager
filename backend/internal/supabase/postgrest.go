package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	baseURL    string
	secretKey  string
	pubKey     string
	httpClient *http.Client
}

func NewClient(supabaseURL, secretKey, pubKey string) *Client {
	return &Client{
		baseURL:   supabaseURL,
		secretKey: secretKey,
		pubKey:    pubKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) newRequest(ctx context.Context, method, endpoint string, body interface{}) (*http.Request, error) {
	u := fmt.Sprintf("%s/rest/v1/%s", c.baseURL, endpoint)
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return nil, err
	}

	apiKey := c.secretKey
	if apiKey == "" {
		apiKey = c.pubKey
	}

	req.Header.Set("apikey", apiKey)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")

	return req, nil
}

type SnapshotRecord struct {
	ID        string                 `json:"id,omitempty"`
	UserID    string                 `json:"user_id"`
	MonthKey  string                 `json:"month_key"`
	Payload   map[string]interface{} `json:"payload"`
	DeviceID  string                 `json:"device_id,omitempty"`
	UpdatedAt string                 `json:"updated_at,omitempty"`
}

func (c *Client) SaveSnapshot(ctx context.Context, record SnapshotRecord) error {
	req, err := c.newRequest(ctx, "POST", "finance_snapshots", record)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase save snapshot error (status %d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *Client) GetSnapshot(ctx context.Context, userID, monthKey string) (*SnapshotRecord, error) {
	endpoint := fmt.Sprintf("finance_snapshots?user_id=eq.%s&month_key=eq.%s&select=*", url.QueryEscape(userID), url.QueryEscape(monthKey))
	req, err := c.newRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase get snapshot error (status %d): %s", resp.StatusCode, string(b))
	}

	var records []SnapshotRecord
	if err := json.NewDecoder(resp.Body).Decode(&records); err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil // No snapshot yet
	}
	return &records[0], nil
}
