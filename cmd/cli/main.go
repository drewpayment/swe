package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"text/tabwriter"

	"github.com/drewpayment/swe/internal/core"
	"github.com/spf13/cobra"
)

var apiURL string

func init() {
	apiURL = os.Getenv("SWE_API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	}
}

func main() {
	rootCmd := &cobra.Command{
		Use:   "swe",
		Short: "SWE — Enterprise Agentic Platform CLI",
	}

	rootCmd.AddCommand(statusCmd())
	rootCmd.AddCommand(projectCmd())
	rootCmd.AddCommand(agentsCmd())
	rootCmd.AddCommand(workCmd())
	rootCmd.AddCommand(artifactsCmd())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// --- Status ---

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Platform health and active projects",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Check health
			resp, err := http.Get(apiURL + "/health")
			if err != nil {
				fmt.Println("SWE API: offline")
				return nil
			}
			defer resp.Body.Close()
			var health map[string]string
			json.NewDecoder(resp.Body).Decode(&health)
			fmt.Printf("SWE API: %s\n\n", health["status"])

			// List projects
			var projects core.ApiResponse[[]core.Project]
			if err := apiGet("/api/v1/projects", &projects); err != nil {
				return err
			}
			if projects.Data != nil && len(*projects.Data) > 0 {
				fmt.Println("Active Projects:")
				tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
				fmt.Fprintln(tw, "NAME\tPHASE\tSTATUS")
				for _, p := range *projects.Data {
					fmt.Fprintf(tw, "%s\t%s\t%s\n", p.Name, p.Phase, p.Status)
				}
				tw.Flush()
			} else {
				fmt.Println("No active projects")
			}
			return nil
		},
	}
}

// --- Projects ---

func projectCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "project",
		Short: "Project management",
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List all projects",
		RunE: func(cmd *cobra.Command, args []string) error {
			var resp core.ApiResponse[[]core.Project]
			if err := apiGet("/api/v1/projects", &resp); err != nil {
				return err
			}
			if resp.Data == nil || len(*resp.Data) == 0 {
				fmt.Println("No projects found")
				return nil
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(tw, "ID\tNAME\tPHASE\tSTATUS")
			for _, p := range *resp.Data {
				fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", p.ID[:8], p.Name, p.Phase, p.Status)
			}
			tw.Flush()
			return nil
		},
	}

	createCmd := &cobra.Command{
		Use:   "create [name]",
		Short: "Create a new project",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			desc, _ := cmd.Flags().GetString("description")
			repo, _ := cmd.Flags().GetString("repo")
			req := core.CreateProjectRequest{Name: args[0]}
			if desc != "" {
				req.Description = &desc
			}
			if repo != "" {
				req.RepoURL = &repo
			}

			var resp core.ApiResponse[core.Project]
			if err := apiPost("/api/v1/projects", req, &resp); err != nil {
				return err
			}
			if resp.Data != nil {
				fmt.Printf("Created project: %s (%s)\n", resp.Data.Name, resp.Data.ID)
			}
			return nil
		},
	}
	createCmd.Flags().StringP("description", "d", "", "Project description")
	createCmd.Flags().StringP("repo", "r", "", "Repository URL")

	getCmd := &cobra.Command{
		Use:   "get [id]",
		Short: "Get project details",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var resp core.ApiResponse[core.Project]
			if err := apiGet("/api/v1/projects/"+args[0], &resp); err != nil {
				return err
			}
			if resp.Data != nil {
				p := resp.Data
				fmt.Printf("Name:   %s\n", p.Name)
				fmt.Printf("ID:     %s\n", p.ID)
				fmt.Printf("Phase:  %s\n", p.Phase)
				fmt.Printf("Status: %s\n", p.Status)
				if p.Description != nil {
					fmt.Printf("Desc:   %s\n", *p.Description)
				}
			}
			return nil
		},
	}

	cmd.AddCommand(listCmd, createCmd, getCmd)
	return cmd
}

// --- Agents ---

func agentsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agents",
		Short: "Agent management",
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List agents",
		RunE: func(cmd *cobra.Command, args []string) error {
			path := "/api/v1/agents"
			if pid, _ := cmd.Flags().GetString("project"); pid != "" {
				path += "?project_id=" + pid
			}
			var resp core.ApiResponse[[]core.Agent]
			if err := apiGet(path, &resp); err != nil {
				return err
			}
			if resp.Data == nil || len(*resp.Data) == 0 {
				fmt.Println("No agents found")
				return nil
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(tw, "ID\tNAME\tROLE\tSTATUS")
			for _, a := range *resp.Data {
				fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", a.ID[:8], a.Name, a.Role, a.Status)
			}
			tw.Flush()
			return nil
		},
	}
	listCmd.Flags().StringP("project", "p", "", "Filter by project ID")

	cmd.AddCommand(listCmd)
	return cmd
}

// --- Work ---

func workCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "work",
		Short: "Work item management",
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List work items",
		RunE: func(cmd *cobra.Command, args []string) error {
			path := "/api/v1/work"
			if pid, _ := cmd.Flags().GetString("project"); pid != "" {
				path += "?project_id=" + pid
			}
			var resp core.ApiResponse[[]core.WorkItem]
			if err := apiGet(path, &resp); err != nil {
				return err
			}
			if resp.Data == nil || len(*resp.Data) == 0 {
				fmt.Println("No work items found")
				return nil
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(tw, "ID\tTITLE\tSTATUS\tPRIORITY")
			for _, w := range *resp.Data {
				fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", w.ID[:8], w.Title, w.Status, w.Priority)
			}
			tw.Flush()
			return nil
		},
	}
	listCmd.Flags().StringP("project", "p", "", "Filter by project ID")

	cmd.AddCommand(listCmd)
	return cmd
}

// --- Artifacts ---

func artifactsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "artifacts",
		Short: "Artifact management",
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List artifacts",
		RunE: func(cmd *cobra.Command, args []string) error {
			path := "/api/v1/artifacts"
			if pid, _ := cmd.Flags().GetString("project"); pid != "" {
				path += "?project_id=" + pid
			}
			var resp core.ApiResponse[[]core.Artifact]
			if err := apiGet(path, &resp); err != nil {
				return err
			}
			if resp.Data == nil || len(*resp.Data) == 0 {
				fmt.Println("No artifacts found")
				return nil
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(tw, "ID\tNAME\tTYPE\tAPPROVAL")
			for _, a := range *resp.Data {
				fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", a.ID[:8], a.Name, a.ArtifactType, a.ApprovalStatus)
			}
			tw.Flush()
			return nil
		},
	}
	listCmd.Flags().StringP("project", "p", "", "Filter by project ID")

	cmd.AddCommand(listCmd)
	return cmd
}

// --- HTTP helpers ---

func apiGet(path string, out any) error {
	resp, err := http.Get(apiURL + path)
	if err != nil {
		return fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return json.Unmarshal(body, out)
}

func apiPost(path string, payload any, out any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	resp, err := http.Post(apiURL+path, "application/json", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return json.Unmarshal(body, out)
}
