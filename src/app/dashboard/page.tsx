'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function Dashboard() {
  const [user, setUser] = useState<{id: string; email?: string; role?: string} | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setUser({ ...user, role: profile?.role })
      }
      setLoading(false)
    }
    getUser()
  }, [])

  if (loading) return <div>Cargando...</div>

  if (!user) return <div>No usuario</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard - {user.role === 'supervisor' ? 'Supervisor' : 'Agente'}</h1>
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
