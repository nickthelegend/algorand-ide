"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from '@supabase/supabase-js'
import { Github } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function GitHubLogin() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) console.error('Error:', error)
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error:', error)
  }

  if (loading) {
    return <div className="w-8 h-8 animate-pulse bg-gray-300 rounded"></div>
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <img 
          src={user.user_metadata?.avatar_url} 
          alt="Avatar" 
          className="w-8 h-8 rounded-full"
        />
        <span className="text-sm">{user.user_metadata?.user_name}</span>
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign Out
        </Button>
      </div>
    )
  }

  return (
    <Button onClick={signInWithGitHub} size="sm" className="gap-2">
      <Github className="w-4 h-4" />
      Sign in with GitHub
    </Button>
  )
}