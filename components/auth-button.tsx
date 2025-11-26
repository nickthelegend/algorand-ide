"use client"

import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function AuthButton() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/projects`
      }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">{user.user_metadata?.user_name || user.email}</span>
        <Button onClick={signOut} variant="outline" size="sm">Sign Out</Button>
      </div>
    )
  }

  return (
    <Button onClick={signInWithGitHub} size="sm">
      Sign in with GitHub
    </Button>
  )
}
