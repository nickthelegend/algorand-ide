"use client"

import { ProjectsList } from "@/components/projects-list"
import { GitHubLogin } from "@/components/github-login"

export default function ProjectsPage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: "var(--background-color)", color: "var(--text-color)" }}>
      <div className="absolute top-4 right-4">
        <GitHubLogin />
      </div>
      <div className="max-w-7xl mx-auto">
        <ProjectsList />
      </div>
    </div>
  )
}