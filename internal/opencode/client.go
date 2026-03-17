package opencode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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
	resp, err := c.post(ctx, "/session", map[string]any{})
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
	body := map[string]any{
		"parts": []map[string]string{
			{"type": "text", "text": message},
		},
	}
	resp, err := c.post(ctx, fmt.Sprintf("/session/%s/message", sessionID), body)
	if err != nil {
		return "", fmt.Errorf("sending message: %w", err)
	}
	// Response may have nested structure — try to extract content
	var result map[string]any
	if err := json.Unmarshal(resp, &result); err != nil {
		return string(resp), nil
	}
	// Check for info.parts[].text or direct content
	if info, ok := result["info"].(map[string]any); ok {
		if parts, ok := info["parts"].([]any); ok {
			var texts []string
			for _, p := range parts {
				if pm, ok := p.(map[string]any); ok {
					if t, ok := pm["text"].(string); ok {
						texts = append(texts, t)
					}
				}
			}
			if len(texts) > 0 {
				return strings.Join(texts, "\n"), nil
			}
		}
	}
	return string(resp), nil
}

func (c *Client) Health(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/session", nil)
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
