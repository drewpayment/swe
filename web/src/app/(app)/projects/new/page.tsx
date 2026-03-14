"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Globe, FolderOpen, Clock } from "lucide-react";
import Link from "next/link";
import { createProject } from "@/lib/api";

type RepoSource = "remote" | "local" | "later";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoSource, setRepoSource] = useState<RepoSource>("remote");
  const [repoUrl, setRepoUrl] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    const payload: Parameters<typeof createProject>[0] = {
      name: name.trim(),
      description: description.trim() || undefined,
      initial_prompt: initialPrompt.trim() || undefined,
    };

    if (repoSource === "remote" && repoUrl.trim()) {
      payload.repo_url = repoUrl.trim();
    } else if (repoSource === "local" && workingDirectory.trim()) {
      payload.working_directory = workingDirectory.trim();
    }

    const res = await createProject(payload);

    if (res.success && res.data) {
      router.push(`/projects/${res.data.id}`);
    } else {
      setError(res.error || "Failed to create project");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none";

  const repoSourceOptions: { value: RepoSource; label: string; icon: typeof Globe }[] = [
    { value: "remote", label: "Remote Repository", icon: Globe },
    { value: "local", label: "Local Directory", icon: FolderOpen },
    { value: "later", label: "I'll add one later", icon: Clock },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/projects"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to projects
        </Link>
        <h1 className="text-2xl font-bold text-white">New Project</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Create a new engineering project
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this project do?"
                rows={3}
                className={inputClass + " resize-none"}
              />
            </div>

            {/* Repo source selector */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Code Source
              </label>
              <div className="grid grid-cols-3 gap-2">
                {repoSourceOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRepoSource(opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
                      repoSource === opt.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {repoSource === "remote" && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Repository URL
                </label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className={inputClass}
                />
              </div>
            )}

            {repoSource === "local" && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Local Directory Path
                </label>
                <input
                  type="text"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  placeholder="~/dev/my-project"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Initial Prompt
              </label>
              <textarea
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                placeholder="Describe what you want the agents to build..."
                rows={5}
                className={inputClass + " resize-none"}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/projects">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
