import { NextRequest, NextResponse } from 'next/server'

const COMPILER_API_URL = process.env.NEXT_PUBLIC_COMPILER_API_URL || 'https://compiler.algocraft.fun'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, ...payload } = body

    let endpoint = ''
    let requestBody = {}

    switch (type) {
      case 'puyapy':
        endpoint = '/compile-puyapy'
        requestBody = { code: payload.code }
        break
      case 'pyteal':
        endpoint = '/compile-pyteal'
        requestBody = { code: payload.code }
        break
      case 'puyats':
        endpoint = '/compile-puyats'
        requestBody = { filename: payload.filename, code: payload.code, forceFresh: payload.forceFresh }
        break
      case 'tealscript':
        endpoint = '/compile-tealscript'
        requestBody = { filename: payload.filename, code: payload.code }
        break
      case 'generate-client':
        endpoint = '/generate-client'
        requestBody = { arc32Json: payload.arc32Json }
        break
      default:
        return NextResponse.json({ error: 'Invalid compilation type' }, { status: 400 })
    }


    const response = await fetch(`${COMPILER_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })


    if (type === 'tealscript') {
      const result = await response.text()
      return NextResponse.json({ ok: response.ok, result })
    } else {
      const result = await response.json()
      return NextResponse.json(result)
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}