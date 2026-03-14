package opencode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client communicates with an OpenCode server instance.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

type CreateSessionResponse struct {
	ID string `json:"id"`
}

type SendMessageResponse struct {
	Content string `json:"content"`
}

func (c *Client) CreateSession(ctx context.Context) (string, error) {
	resp, err := c.post(ctx, "/api/session", nil)
	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}
	var result CreateSessionResponse
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("parsing session response: %w", err)
	}
	return result.ID, nil
}

func (c *Client) SendMessage(ctx context.Context, sessionID, message string) (string, error) {
	body := map[string]string{"message": message}
	resp, err := c.post(ctx, fmt.Sprintf("/api/session/%s/message", sessionID), body)
	if err != nil {
		return "", fmt.Errorf("sending message: %w", err)
	}
	var result SendMessageResponse
	if err := json.Unmarshal(resp, &result); err != nil {
		// If structured parse fails, return raw response
		return string(resp), nil
	}
	return result.Content, nil
}

func (c *Client) Health(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/health", nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (c *Client) post(ctx context.Context, path string, body any) ([]byte, error) {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("opencode API error %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}
