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

    } catch (deleteError: unknown) {
      console.error('Error completo durante eliminación:', deleteError)
      const error = deleteError as { message: string }
      alert(`Error al eliminar: ${error.message}`)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando sesiones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Gestionar Sesiones</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Controla y administra tus sesiones de quiz interactivo
                </p>
              </div>
            </div>

            {/* Create Session Button */}
            <Link href="/quizzes">
              <Button className="bg-blue-500 hover:bg-blue-600">
                <Play className="w-4 h-4 mr-2" />
                Crear Nueva Sesión
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">

        {/* Status Summary */}
        {sessions.length > 0 && (
          <div className="bg-white rounded-lg border p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Resumen de Sesiones</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {sessions.length} {sessions.length === 1 ? 'sesión creada' : 'sesiones creadas'} disponibles
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{sessions.length}</div>
                  <div className="text-xs text-gray-600">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {sessions.filter(s => s.status === 'running' || s.status === 'lobby').length}
                  </div>
                  <div className="text-xs text-gray-600">Activas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {sessions.filter(s => s.status === 'ended').length}
                  </div>
                  <div className="text-xs text-gray-600">Completadas</div>
                </div>
              </div>
            </div>
          </div>
        )}

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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card key={session.id} className="group hover:shadow-lg transition-all duration-300 border-0 shadow-md">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold text-gray-800 mb-2">
                      Sesión {session.code}
                    </CardTitle>
                    <Badge variant="secondary" className="mb-2">
                      {getStatusBadge(session.status)}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSession(session.id)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Eliminar sesión"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-sm text-gray-700 font-medium line-clamp-2">
                  {session.quiz?.title || 'Quiz eliminado'}
                </p>
                {session.quiz?.category && (
                  <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs mt-2">
                    {session.quiz.category}
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">{session.participant_count} participantes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">
                        {new Date(session.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {session.status === 'ended' ? (
                      <Button
                        asChild
                        className="flex-1 bg-white hover:bg-blue-600 text-gray-700 hover:text-white border border-gray-300"
                        size="sm"
                      >
                        <Link href={`/sessions/${session.id}`}>
                          <Users className="w-4 h-4 mr-1" />
                          Ver Resultados
                        </Link>
                      </Button>
                    ) : (
                      <>
                        <Button
                          asChild
                          className="flex-1"
                          size="sm"
                        >
                          <Link href={`/sessions/${session.id}`}>
                            <Play className="w-3 h-3 mr-1" />
                            {session.status === 'lobby' ? 'Controlar' : 'Ver'}
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelSession(session.id)}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          title="Cancelar sesión"
                        >
                          <Square className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
