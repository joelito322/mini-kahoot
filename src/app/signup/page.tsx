'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignup = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else {
      // Insertar perfil
      const { data: user } = await supabase.auth.getUser()
      if (user.user) {
        await supabase.from('profiles').insert({
          id: user.user.id,
          role,
          full_name: email.split('@')[0],
        })
      }
      // Redireccionar (middleware lo hará a dashboard)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear Cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div>
              <Label>Rol:</Label>
              <RadioGroup value={role} onValueChange={setRole}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="agent" id="agent" />
                  <Label htmlFor="agent">Agente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supervisor" id="supervisor" />
                  <Label htmlFor="supervisor">Supervisor</Label>
                </div>
              </RadioGroup>
            </div>
            {error && <p className="text-red-500">{error}</p>}
            <Button onClick={handleSignup} disabled={loading} className="w-full">
              {loading ? 'Cargando...' : 'Registrar'}
            </Button>
            <p className="text-center">
              ¿Ya tienes cuenta? <Link href="/login" className="text-blue-500">Inicia sesión</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
