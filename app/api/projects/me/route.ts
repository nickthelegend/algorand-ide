import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_files(
          file_structure,
          updated_at
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, template, file_structure, shareable = 'private' } = body

    // Generate project ID
    const project_id = `${template.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        project_id,
        user_id: user.id,
        name,
        description,
        template,
        shareable
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }


    // Insert initial file structure
    const { error: fileError } = await supabase
      .from('project_files')
      .insert({
        project_id,
        file_structure
      })

    if (fileError) {
      return NextResponse.json({ error: fileError.message }, { status: 500 })
    }

    return NextResponse.json({ project })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}