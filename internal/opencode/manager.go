package opencode

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// expandHome replaces a leading ~ with the user's home directory.
func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, path[2:])
		}
	}
	return path
}

// Manager handles OpenCode server lifecycle per project.
type Manager struct {
	mu        sync.Mutex
	servers   map[string]*ServerInstance // project ID -> instance
	portBase  int
	portMax   int
	usedPorts map[int]string // port -> project ID
}

type ServerInstance struct {
	ProjectID  string
	Port       int
	URL        string
	WorkDir    string
	Cmd        *exec.Cmd
	LastActive time.Time
	Sessions   map[string]string // agent ID -> session ID
}

func NewManager() *Manager {
	return &Manager{
		servers:   make(map[string]*ServerInstance),
		portBase:  9100,
		portMax:   9199,
		usedPorts: make(map[int]string),
	}
}

func (m *Manager) StartServer(ctx context.Context, projectID, workDir string) (*ServerInstance, error) {
	workDir = expandHome(workDir)

	m.mu.Lock()
	defer m.mu.Unlock()

	// Return existing if running
	if inst, ok := m.servers[projectID]; ok {
		if m.isHealthy(inst) {
			inst.LastActive = time.Now()
			return inst, nil
		}
		// Not healthy, clean up
		m.stopServerLocked(projectID)
	}

	// Ensure working directory exists and is a git repo
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating work dir %s: %w", workDir, err)
	}
	if _, err := os.Stat(workDir + "/.git"); os.IsNotExist(err) {
		gitInit := exec.Command("git", "init")
		gitInit.Dir = workDir
		if out, err := gitInit.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("git init in %s: %s: %w", workDir, string(out), err)
		}
	}

	// Allocate port
	port, err := m.allocatePort(projectID)
	if err != nil {
		return nil, err
	}

	// Start opencode serve
	cmd := exec.CommandContext(ctx, "opencode", "serve", "--port", fmt.Sprintf("%d", port))
	cmd.Dir = workDir
	if err := cmd.Start(); err != nil {
		m.freePort(port)
		return nil, fmt.Errorf("starting opencode: %w", err)
	}

	inst := &ServerInstance{
		ProjectID:  projectID,
		Port:       port,
		URL:        fmt.Sprintf("http://localhost:%d", port),
		WorkDir:    workDir,
		Cmd:        cmd,
		LastActive: time.Now(),
		Sessions:   make(map[string]string),
	}
	m.servers[projectID] = inst

	// Wait for health
	if err := m.waitForHealth(inst, 30*time.Second); err != nil {
		m.stopServerLocked(projectID)
		return nil, fmt.Errorf("opencode failed to start: %w", err)
	}

	return inst, nil
}

func (m *Manager) StopServer(projectID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopServerLocked(projectID)
}

func (m *Manager) stopServerLocked(projectID string) {
	inst, ok := m.servers[projectID]
	if !ok {
		return
	}
	if inst.Cmd != nil && inst.Cmd.Process != nil {
		inst.Cmd.Process.Kill()
	}
	m.freePort(inst.Port)
	delete(m.servers, projectID)
}

func (m *Manager) GetServer(projectID string) (*ServerInstance, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inst, ok := m.servers[projectID]
	if ok {
		inst.LastActive = time.Now()
	}
	return inst, ok
}

func (m *Manager) allocatePort(projectID string) (int, error) {
	for port := m.portBase; port <= m.portMax; port++ {
		if _, used := m.usedPorts[port]; !used {
			m.usedPorts[port] = projectID
			return port, nil
		}
	}
	return 0, fmt.Errorf("no ports available in range %d-%d", m.portBase, m.portMax)
}

func (m *Manager) freePort(port int) {
	delete(m.usedPorts, port)
}

func (m *Manager) isHealthy(inst *ServerInstance) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(inst.URL + "/api/health")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (m *Manager) waitForHealth(inst *ServerInstance, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if m.isHealthy(inst) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("health check timed out after %s", timeout)
}

// CleanupIdle stops servers that have been idle for the given duration.
func (m *Manager) CleanupIdle(maxIdle time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for pid, inst := range m.servers {
		if now.Sub(inst.LastActive) > maxIdle {
			m.stopServerLocked(pid)
		}
	}
}
