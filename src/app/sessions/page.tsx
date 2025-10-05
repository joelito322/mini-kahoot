'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Array<{id: string; code: string; status: string; created_at: string}>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase.from('sessions').select('*')
      if (error) console.error(error)
      else setSessions(data || [])
      setLoading(false)
    }
    fetchSessions()
  }, [])

  if (loading) return <div>Cargando sesiones...</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gestionar Sesiones</h1>
      {sessions.length === 0 ? (
        <p>No hay sesiones creadas.</p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>Código: {session.code} - Estado: {session.status}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
