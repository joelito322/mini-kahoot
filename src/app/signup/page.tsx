'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('supervisor')
  const [loading, setLoading] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
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

  const handleGoogleSignup = async () => {
    setLoadingGoogle(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })
    if (error) setError(error.message)
    setLoadingGoogle(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear Cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p>Rol asignado: Supervisor</p>
              <p className="text-sm text-gray-600">Solo los supervisores necesitan registrarse para crear y administrar salas.</p>
            </div>
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
            {error && <p className="text-red-500">{error}</p>}
            <Button onClick={handleSignup} disabled={loading || !role} className="w-full">
              {loading ? 'Cargando...' : 'Registrar'}
            </Button>
            <div className="flex items-center space-x-2">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-gray-500">o</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>
            <Button onClick={handleGoogleSignup} disabled={loadingGoogle || !role} variant="outline" className="w-full">
              {loadingGoogle ? 'Cargando...' : 'Continuar con Google'}
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
