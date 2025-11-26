"use client"

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AlgorandIDE from '@/components/algorand-ide'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ProjectCreatorProps {
  initialFiles: any
  selectedTemplate: string
  selectedTemplateName: string
}

export function ProjectCreator({ initialFiles, selectedTemplate, selectedTemplateName }: ProjectCreatorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectParam = searchParams.get('project')
  const contractParam = searchParams.get('contract')
  
  const [showDialog, setShowDialog] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadingContract, setLoadingContract] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [shareable, setShareable] = useState('private')
  const [contractCode, setContractCode] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user)
      
      // Show dialog only if no project param and user is logged in
      if (!projectParam && session?.user) {
        setShowDialog(true)
      }
    }
    getUser()
  }, [projectParam])

  useEffect(() => {
    const loadContract = async () => {
      if (!contractParam) return
      
      setLoadingContract(true)
      try {
        const response = await fetch('/api/load-contract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ encoded: contractParam })
        })
        
        const result = await response.json()
        if (result.success && result.code) {
          setContractCode(result.code)
        }
      } catch (error) {
        console.error('Failed to load contract:', error)
      } finally {
        setLoadingContract(false)
      }
    }
    loadContract()
  }, [contractParam])

  const createProject = async () => {
    if (!user || !projectName.trim()) return
    
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      let fileStructure = initialFiles
      
      // If contract code is loaded, add it to file structure
      if (contractCode) {
        fileStructure = {
          ...initialFiles,
          'contract.algo.ts': {
            file: { contents: contractCode }
          }
        }
      }

      const response = await fetch('/api/projects/me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim(),
          template: selectedTemplate,
          file_structure: fileStructure,
          shareable
        })
      })

      if (response.ok) {
        const data = await response.json()
        router.push(`/project/${data.project.project_id}`)
      } else {
        const errorData = await response.json()
        console.error('Server error:', errorData)
        alert(`Failed to create project: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    setLoading(true)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`
        }
      })
    } catch (error) {
      console.error('Login failed:', error)
      setLoading(false)
    }
  }

  return (
    <>
      <AlgorandIDE
        initialFiles={initialFiles}
        selectedTemplate={selectedTemplate}
        selectedTemplateName={selectedTemplateName}
        projectId={projectParam}
      />
      
      <Dialog open={showDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{user ? 'Create New Project' : 'Login Required'}</DialogTitle>
          </DialogHeader>
          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please login to create a project and access the code editor.
              </p>
              <Button onClick={handleLogin} disabled={loading} className="w-full">
                {loading ? 'Redirecting...' : 'Login with GitHub'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Algorand Project"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Describe your project..."
                />
              </div>
              <div>
                <Label htmlFor="shareable">Visibility</Label>
                <Select value={shareable} onValueChange={setShareable}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowDialog(false)} 
                  variant="outline"
                  className="flex-1"
                >
                  Skip
                </Button>
                <Button 
                  onClick={createProject} 
                  disabled={!projectName.trim() || loading}
                  className="flex-1"
                >
                  {loading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}