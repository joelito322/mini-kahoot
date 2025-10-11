'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else {
      router.push(redirectTo)
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    setLoadingGoogle(true)
    setError('')
    // Detect if we're in production (on netlify)
    const isProduction = window.location.host.includes('netlify.app')
    const baseUrl = isProduction ? 'https://mini-kahoot.netlify.app' : window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${baseUrl}${redirectTo}`
      }
    })
    if (error) setError(error.message)
    setLoadingGoogle(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar Sesión</CardTitle>
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
            {error && <p className="text-red-500">{error}</p>}
            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? 'Cargando...' : 'Iniciar Sesión'}
            </Button>
            <div className="flex items-center space-x-2">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-gray-500">o</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>
            <Button onClick={handleGoogleLogin} disabled={loadingGoogle} variant="outline" className="w-full">
              {loadingGoogle ? 'Cargando...' : 'Continuar con Google'}
            </Button>
            <p className="text-center">
              ¿No tienes cuenta? <Link href="/signup" className="text-blue-500">Regístrate</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-50"><div>Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
