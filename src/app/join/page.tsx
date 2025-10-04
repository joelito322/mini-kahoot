'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export default function JoinPage() {
  const [code, setCode] = useState('')
  const [alias, setAlias] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Debes iniciar sesión para unirte.')
      setLoading(false)
      return
    }

    // Insert participant
    const { error: insertError } = await supabase
      .from('session_participants')
      .insert({
        session_id: session.id,
        user_id: user.id,
        alias,
      })
    if (insertError) {
      setError('Error al unirte: ' + insertError.message)
    } else {
      router.push(`/session/${code}`)
    }
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
