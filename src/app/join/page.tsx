'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

function JoinForm() {
  const [code, setCode] = useState('')
  const [alias, setAlias] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ id: string } | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
    const codeParam = searchParams.get('code')
    if (codeParam) setCode(codeParam)
  }, [searchParams])

  const handleJoin = async () => {
    setLoading(true)
    setError('')
    // Verificar sesión activa
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('code', code)
      .eq('status', 'lobby')
      .single()
    if (sessionError || !session) {
      setError('Código de sala inválido o sala no disponible.')
      setLoading(false)
      return
    }

    if (!user) {
      router.push(`/login?redirect=/join?code=${code}`)
      setLoading(false)
      return
    }

    // Insert participant (allow multiple joins for testing)
    const { data: participant, error: insertError } = await supabase
      .from('session_participants')
      .insert({
        session_id: session.id,
        user_id: user.id,
        alias,
      })
      .select()
      .single()

    if (insertError) {
      setError('Error al unirte: ' + insertError.message)
      setLoading(false)
      return
    }

    // Create initial score
    const { error: scoreError } = await supabase
      .from('scores')
      .insert({
        session_id: session.id,
        participant_id: participant.id,
        score: 0
      })

    if (scoreError) {
      console.error('Error creating score:', scoreError)
      // Continue anyway as score can be created later
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('participant_id', participant.id)
    }
    router.push(`/game/${code}`)
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Unirse a una Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Código de Sala</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ingrese el código"
              />
            </div>
            <div>
              <Label htmlFor="alias">Alias</Label>
              <Input
                id="alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Tu alias visible"
              />
            </div>
            {error && <p className="text-red-500">{error}</p>}
            <Button onClick={handleJoin} disabled={loading} className="w-full">
              {loading ? 'Uniéndome...' : 'Unirme'}
            </Button>
            {!user && (
              <p className="text-center">
                ¿No tienes cuenta? <Link href="/signup" className="text-blue-500">Regístrate</Link> o <Link href="/login" className="text-blue-500">Inicia sesión</Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-50"><div>Loading...</div></div>}>
      <JoinForm />
    </Suspense>
  )
}
