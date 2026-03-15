package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// Config is the top-level platform configuration.
type Config struct {
	Platform   PlatformConfig   `json:"platform" toml:"platform"`
	Temporal   TemporalConfig   `json:"temporal" toml:"temporal"`
	LLM        LLMConfig        `json:"llm" toml:"llm"`
	Kubernetes KubernetesConfig `json:"kubernetes" toml:"kubernetes"`
	API        APIConfig        `json:"api" toml:"api"`
	Database   DatabaseConfig   `json:"database" toml:"database"`
	Redis      RedisConfig      `json:"redis" toml:"redis"`
}

type RedisConfig struct {
	URL string `json:"url" toml:"url"`
}

type PlatformConfig struct {
	Name     string `json:"name" toml:"name"`
	LogLevel string `json:"log_level" toml:"log_level"`
	Debug    bool   `json:"debug" toml:"debug"`
}

type TemporalConfig struct {
	Address   string `json:"address" toml:"address"`
	Namespace string `json:"namespace" toml:"namespace"`
	TaskQueue string `json:"task_queue" toml:"task_queue"`
}

type LLMConfig struct {
	ProxyURL     string            `json:"proxy_url" toml:"proxy_url"`
	DefaultModel string            `json:"default_model" toml:"default_model"`
	APIKey       string            `json:"api_key" toml:"api_key"`
	RoleModels   map[string]string `json:"role_models" toml:"role_models"`
}

type KubernetesConfig struct {
	Kubeconfig         *string `json:"kubeconfig,omitempty" toml:"kubeconfig,omitempty"`
	SandboxNamespace   string  `json:"sandbox_namespace" toml:"sandbox_namespace"`
	DefaultCPULimit    string  `json:"default_cpu_limit" toml:"default_cpu_limit"`
	DefaultMemoryLimit string  `json:"default_memory_limit" toml:"default_memory_limit"`
	SandboxTimeout     int     `json:"sandbox_timeout_seconds" toml:"sandbox_timeout_seconds"`
}

type APIConfig struct {
	Host        string   `json:"host" toml:"host"`
	Port        int      `json:"port" toml:"port"`
	InternalURL string   `json:"internal_url" toml:"internal_url"`
	CORSEnabled bool     `json:"cors_enabled" toml:"cors_enabled"`
	CORSOrigins []string `json:"cors_origins" toml:"cors_origins"`
}

type DatabaseConfig struct {
	URL            string `json:"url" toml:"url"`
	MaxConnections int    `json:"max_connections" toml:"max_connections"`
}

// DirsPath returns the platform config directory (~/.swe).
func DirsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".swe")
}

// DefaultConfig returns a config with sensible defaults.
func DefaultConfig() Config {
	return Config{
		Platform: PlatformConfig{
			Name:     "swe",
			LogLevel: "info",
			Debug:    false,
		},
		Temporal: TemporalConfig{
			Address:   "localhost:7233",
			Namespace: "default",
			TaskQueue: "swe-workers",
		},
		LLM: LLMConfig{
			ProxyURL:     "http://localhost:4000",
			DefaultModel: "local",
			APIKey:       "sk-swe-dev-key",
			RoleModels:   map[string]string{},
		},
		Kubernetes: KubernetesConfig{
			SandboxNamespace:   "swe-sandboxes",
			DefaultCPULimit:    "1",
			DefaultMemoryLimit: "2Gi",
			SandboxTimeout:     3600,
		},
		API: APIConfig{
			Host:        "0.0.0.0",
			Port:        8080,
			CORSEnabled: true,
			CORSOrigins: []string{"http://localhost:3000", "http://swe-web.swe.orb.local", "https://swe-web.swe.orb.local"},
		},
		Database: DatabaseConfig{
			URL:            "postgres://swe:swe@localhost:5432/swe?sslmode=disable",
			MaxConnections: 10,
		},
		Redis: RedisConfig{
			URL: "redis://localhost:6379",
		},
	}
}

// LoadDefault loads configuration from the default path (~/.swe/config.toml).
// Falls back to defaults if file doesn't exist.
func LoadDefault() (Config, error) {
	configPath := filepath.Join(DirsPath(), "config.toml")
	return LoadFrom(configPath)
}

// LoadFrom loads configuration from a specific path.
func LoadFrom(path string) (Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, fmt.Errorf("reading config: %w", err)
	}

	if err := toml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parsing config: %w", err)
	}

	return cfg, nil
}

// Save writes the config to the given path.
func (c Config) Save(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}

	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating config file: %w", err)
	}
	defer f.Close()

	enc := toml.NewEncoder(f)
	if err := enc.Encode(c); err != nil {
		return fmt.Errorf("encoding config: %w", err)
	}

	return nil
}

// LoadFromEnv creates config from environment variables, with fallback to defaults.
func LoadFromEnv() Config {
	cfg := DefaultConfig()

	if v := os.Getenv("DATABASE_URL"); v != "" {
		cfg.Database.URL = v
	}
	if v := os.Getenv("TEMPORAL_ADDRESS"); v != "" {
		cfg.Temporal.Address = v
	}
	if v := os.Getenv("LITELLM_URL"); v != "" {
		cfg.LLM.ProxyURL = v
	}
	if v := os.Getenv("LITELLM_API_KEY"); v != "" {
		cfg.LLM.APIKey = v
	}
	if v := os.Getenv("REDIS_URL"); v != "" {
		cfg.Redis.URL = v
	}
	if v := os.Getenv("HOST"); v != "" {
		cfg.API.Host = v
	}
	if v := os.Getenv("PORT"); v != "" {
		var port int
		if _, err := fmt.Sscanf(v, "%d", &port); err == nil {
			cfg.API.Port = port
		}
	}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		cfg.API.CORSOrigins = strings.Split(v, ",")
	}
	if v := os.Getenv("API_INTERNAL_URL"); v != "" {
		cfg.API.InternalURL = v
	}

	return cfg
}
