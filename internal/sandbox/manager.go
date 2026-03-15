package sandbox

import (
	"context"
	"fmt"

	"github.com/drewpayment/swe/internal/core"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// SandboxConfig holds configuration for a sandbox K8s Job.
type SandboxConfig struct {
	AgentID      string            `json:"agent_id"`
	Role         core.AgentRole    `json:"role"`
	Namespace    string            `json:"namespace"`
	Image        string            `json:"image"`
	CPULimit     string            `json:"cpu_limit"`
	MemoryLimit  string            `json:"memory_limit"`
	Timeout      int64             `json:"timeout_seconds"`
	EnvVars      map[string]string `json:"env_vars"`
	VolumeMounts []string          `json:"volume_mounts"`
}

// Manager manages K8s sandbox Jobs.
type Manager struct {
	client    kubernetes.Interface
	namespace string
}

// NewManager creates a new sandbox manager.
func NewManager(namespace string, kubeconfig *string) (*Manager, error) {
	var cfg *rest.Config
	var err error

	if kubeconfig != nil && *kubeconfig != "" {
		cfg, err = clientcmd.BuildConfigFromFlags("", *kubeconfig)
	} else {
		cfg, err = rest.InClusterConfig()
		if err != nil {
			// Fall back to default kubeconfig
			loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
			cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
				loadingRules, &clientcmd.ConfigOverrides{},
			).ClientConfig()
		}
	}
	if err != nil {
		return nil, fmt.Errorf("building k8s config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("creating k8s client: %w", err)
	}

	return &Manager{
		client:    clientset,
		namespace: namespace,
	}, nil
}

// ImageForRole returns the sandbox image for a given role.
func ImageForRole(role core.AgentRole) string {
	switch role {
	case core.RoleCoder:
		return "ghcr.io/drewpayment/swe-sandbox-coder:latest"
	case core.RoleSdet:
		return "ghcr.io/drewpayment/swe-sandbox-sdet:latest"
	case core.RoleSecurity:
		return "ghcr.io/drewpayment/swe-sandbox-security:latest"
	case core.RoleDevOps, core.RolePlatform:
		return "ghcr.io/drewpayment/swe-sandbox-devops:latest"
	default:
		return "ghcr.io/drewpayment/swe-sandbox-base:latest"
	}
}

// Create creates a new sandbox K8s Job.
func (m *Manager) Create(ctx context.Context, cfg SandboxConfig) (string, error) {
	jobName := fmt.Sprintf("swe-sandbox-%s", cfg.AgentID)

	envVars := []corev1.EnvVar{
		{Name: "SWE_AGENT_ID", Value: cfg.AgentID},
		{Name: "SWE_ROLE", Value: string(cfg.Role)},
	}
	for k, v := range cfg.EnvVars {
		envVars = append(envVars, corev1.EnvVar{Name: k, Value: v})
	}

	var backoffLimit int32 = 0
	var activeDeadline int64 = cfg.Timeout

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: m.namespace,
			Labels: map[string]string{
				"app":      "swe-sandbox",
				"agent-id": cfg.AgentID,
				"role":     string(cfg.Role),
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:          &backoffLimit,
			ActiveDeadlineSeconds: &activeDeadline,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{
						{
							Name:  "sandbox",
							Image: cfg.Image,
							Env:   envVars,
							Resources: corev1.ResourceRequirements{
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse(cfg.CPULimit),
									corev1.ResourceMemory: resource.MustParse(cfg.MemoryLimit),
								},
							},
						},
					},
				},
			},
		},
	}

	created, err := m.client.BatchV1().Jobs(m.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return "", fmt.Errorf("creating sandbox job: %w", err)
	}

	return created.Name, nil
}

// Delete deletes a sandbox Job.
func (m *Manager) Delete(ctx context.Context, jobName string) error {
	propagation := metav1.DeletePropagationForeground
	return m.client.BatchV1().Jobs(m.namespace).Delete(ctx, jobName, metav1.DeleteOptions{
		PropagationPolicy: &propagation,
	})
}

// List lists all sandbox Jobs.
func (m *Manager) List(ctx context.Context) ([]string, error) {
	jobs, err := m.client.BatchV1().Jobs(m.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=swe-sandbox",
	})
	if err != nil {
		return nil, err
	}

	var names []string
	for _, j := range jobs.Items {
		names = append(names, j.Name)
	}
	return names, nil
}

// Logs returns the logs of a sandbox Job's pod.
func (m *Manager) Logs(ctx context.Context, jobName string) (string, error) {
	pods, err := m.client.CoreV1().Pods(m.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("job-name=%s", jobName),
	})
	if err != nil {
		return "", err
	}
	if len(pods.Items) == 0 {
		return "", fmt.Errorf("no pods found for job %s", jobName)
	}

	req := m.client.CoreV1().Pods(m.namespace).GetLogs(pods.Items[0].Name, &corev1.PodLogOptions{})
	stream, err := req.Stream(ctx)
	if err != nil {
		return "", err
	}
	defer stream.Close()

	buf := make([]byte, 0)
	tmp := make([]byte, 4096)
	for {
		n, err := stream.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}
	return string(buf), nil
}
