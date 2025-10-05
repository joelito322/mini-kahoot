'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Users, Clock, Square, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Session {
  id: string
  code: string
  status: string
  created_at: string
  quiz: {
    id: string
    title: string
    category: string
  } | null
  participant_count: number
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    fetchSessions()
  }, [refreshTrigger])

  const fetchSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id, code, status, created_at,
        quiz:quizzes(id, title, category),
        session_participants(count)
      `)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      // Process participant count
      const processedSessions = data?.map(session => ({
        ...session,
        participant_count: session.session_participants?.[0]?.count || 0,
        quiz: Array.isArray(session.quiz) ? session.quiz[0] || null : session.quiz
      })) || []
      console.log('Sesiones obtenidas de BD:', processedSessions.length, processedSessions.map(s => s.id))
      setSessions(processedSessions)
    }
    setLoading(false)
  }

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta sesión? Los participantes serán desconectados.')) return

    const { error } = await supabase
      .from('sessions')
      .update({ 
        status: 'ended', 
        current_question_id: null, 
        ended_at: new Date().toISOString() 
      })
      .eq('id', sessionId)

    if (error) {
      console.error('Error cancelando sesión:', error)
      alert('Error al cancelar la sesión')
    } else {
      // Refresh the sessions list
      fetchSessions()
      alert('Sesión cancelada exitosamente')
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const confirmMessage = '¿Estás seguro de que quieres eliminar esta sesión permanentemente? Esta acción no se puede deshacer.'
    if (!confirm(confirmMessage)) return

    console.log('Iniciando eliminación de sesión:', sessionId)

    // First delete related records to avoid foreign key constraints
    try {
      // Delete scores first
      console.log('Eliminando scores...')
      const { error: scoresError } = await supabase.from('scores').delete().eq('session_id', sessionId)
      if (scoresError) throw new Error(`Error scores: ${scoresError.message}`)

      // Delete answers
      console.log('Eliminando answers...')
      const { error: answersError } = await supabase.from('answers').delete().eq('session_id', sessionId)
      if (answersError) throw new Error(`Error answers: ${answersError.message}`)

      // Delete session participants
      console.log('Eliminando session participants...')
      const { error: participantsError } = await supabase.from('session_participants').delete().eq('session_id', sessionId)
      if (participantsError) throw new Error(`Error participants: ${participantsError.message}`)

      // Finally delete the session
      console.log('Eliminando sesión principal...')
      const { error: sessionError } = await supabase.from('sessions').delete().eq('id', sessionId)
      if (sessionError) throw new Error(`Error session: ${sessionError.message}`)

      console.log('Eliminación completada exitosamente')

      // Force a complete refresh by incrementing the trigger
      console.log('Forzando recarga completa...')
      setRefreshTrigger(prev => prev + 1)

      alert('Sesión eliminada exitosamente')

    } catch (deleteError: any) {
      console.error('Error completo durante eliminación:', deleteError)
      alert(`Error al eliminar: ${deleteError.message}`)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      lobby: { label: 'Esperando', variant: 'secondary' as const },
      running: { label: 'En curso', variant: 'default' as const },
      paused: { label: 'Pausada', variant: 'outline' as const },
      ended: { label: 'Finalizada', variant: 'destructive' as const }
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.lobby
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (loading) return <div className="p-6">Cargando sesiones...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Gestionar Sesiones</h1>
      </div>
      <div className="flex justify-end mb-6">
        <Link href="/quizzes">
          <Button variant="outline">
            <Play className="w-4 h-4 mr-2" />
            Crear Nueva Sesión
          </Button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No hay sesiones creadas.</p>
          <Link href="/quizzes">
            <Button>
              <Play className="w-4 h-4 mr-2" />
              Crear primera sesión
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card key={session.id} className="relative">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <CardTitle className="text-lg">Sesión {session.code}</CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(session.status)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSession(session.id)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Eliminar sesión"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{session.quiz?.title || 'Quiz eliminado'}</p>
                {session.quiz?.category && (
                  <Badge variant="outline">{session.quiz.category}</Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{session.participant_count} participantes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(session.created_at).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
                {session.status === 'ended' ? (
                  <div className="flex gap-2">
                    <Button
                      asChild
                      className="flex-1"
                      disabled={true}
                    >
                      <Link href={`/sessions/${session.id}`}>
                        Ver Resultados
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      asChild
                      size="sm"
                    >
                      <Link href={`/sessions/${session.id}`}>
                        {session.status === 'lobby' ? 'Controlar' : 'Ver'}
                      </Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancelSession(session.id)}
                    >
                      <Square className="w-4 h-4 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
