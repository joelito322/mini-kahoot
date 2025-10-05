'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const [user, setUser] = useState<{id: string; email?: string; role?: string} | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('User from auth:', user, error)
      if (user) {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        console.log('Profile:', profile, profileError)
        if (profile) {
          setUser({ ...user, role: profile.role })
        } else {
          console.error('Profile not found for user', user.id)
          // Optionally create profile
        }
      }
      setLoading(false)
    }
    getUser()
  }, [])

  if (loading) return <div>Cargando...</div>

  if (!user) return <div>No usuario</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Dashboard - {user.role === 'supervisor' ? 'Supervisor' : 'Agente'}</h1>
      </div>
      {user.role === 'supervisor' ? (
        <div>
          <Link href="/quizzes">
            <Button className="mr-4">Gestionar Quizzes</Button>
          </Link>
          <Link href="/sessions">
            <Button>Gestionar Sesiones</Button>
          </Link>
        </div>
      ) : (
        <div>
          <Link href="/join">
            <Button>Unirse a una Sesión</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
