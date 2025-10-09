'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play, Pause, Square, Users, Clock, Trophy } from 'lucide-react'

interface Session {
  id: string
  code: string
  status: string
  current_question_id: string | null
  created_at: string
  quiz: {
    id: string
    title: string
    questions: Array<{
      id: string
      text: string
      order_index: number
      time_limit_sec: number
      options: Array<{
        id: string
        text: string
        is_correct: boolean
      }>
    }>
  } | null
}

interface Participant {
  id: string
  alias: string
  user_id: string
  joined_at: string
  score: number
}

interface CurrentQuestion {
  id: string
  text: string
  time_limit_sec: number
  options: Array<{
    id: string
    text: string
    is_correct: boolean
  }>
  answers: Array<{
    participant_id: string
    option_id: string
    time_ms: number
  }>
}

export default function SessionControlPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    fetchSession()
    setupRealtimeSubscription()

    return () => {
      supabase.removeAllChannels()
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSession = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id, code, status, current_question_id, created_at, created_by,
        quiz:quizzes(id, title)
      `)
      .eq('id', sessionId)
      .single()

    if (error) {
      console.error('Error fetching session:', error)
      alert('Sesión no encontrada')
      router.push('/sessions')
      return
    }

    // Check if user is the host
    if (data.created_by !== user.id) {
      alert('No tienes permisos para controlar esta sesión')
      router.push('/sessions')
      return
    }

    // Process quiz
    let fullQuiz: Session['quiz'] = data.quiz ? {
      ...data.quiz,
      questions: []
    } : null

    // Fetch questions separately to avoid nested RLS issues
    if (fullQuiz) {
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select(`
          id, text, order_index, time_limit_sec,
          options(id, text, is_correct)
        `)
        .eq('quiz_id', fullQuiz.id)
        .order('order_index', { ascending: true })

      if (questionsError) {
        alert('Error al cargar preguntas: ' + questionsError.message)
        fullQuiz.questions = []
      } else if (questionsData) {
        fullQuiz.questions = questionsData
      } else {
        fullQuiz.questions = []
      }
    }

    const processedData: Session = {
      ...data,
      quiz: fullQuiz
    }

    setSession(processedData)
    setIsHost(true)
    fetchParticipants()
    fetchCurrentQuestion()
    setLoading(false)
  }

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from('session_participants')
      .select(`
        id, alias, user_id, joined_at,
        scores!inner(session_id, score)
      `)
      .eq('session_id', sessionId)
      .eq('scores.session_id', sessionId)

    if (error) {
      console.error('Error fetching participants:', error)
    } else {
      const processedParticipants = data?.map(p => ({
        ...p,
        score: p.scores?.[0]?.score || 0
      })).sort((a, b) => a.alias.localeCompare(b.alias)) || [] // Simple sort by alias
      setParticipants(processedParticipants)
    }
  }

  const fetchCurrentQuestion = async () => {
    if (!session?.current_question_id) {
      setCurrentQuestion(null)
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, time_limit_sec,
        options(id, text, is_correct),
        answers(participant_id, option_id, time_ms)
      `)
      .eq('id', session.current_question_id)
      .single()

    if (error) {
      console.error('Error fetching current question:', error)
    } else {
      setCurrentQuestion(data)
      if (session.status === 'running') {
        startTimer(data.time_limit_sec)
      }
    }
  }

  const setupRealtimeSubscription = () => {
    // Subscribe to session updates
    supabase
      .channel('session-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, (payload: any) => {
        if (payload.new) {
          setSession(current => ({ ...current!, ...payload.new }))
        }
      })
      .subscribe()

    // Subscribe to participant updates
    supabase
      .channel('participant-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, (_payload: any) => {
        fetchParticipants()
      })
      .subscribe()

    // Subscribe to answers
    supabase
      .channel('answer-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'answers',
        filter: `session_id=eq.${sessionId}`
      }, (_payload: any) => {
        if (currentQuestion) {
          fetchCurrentQuestion()
        }
      })
      .subscribe()
  }

  const startTimer = (duration: number) => {
    setTimeRemaining(duration)
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleStartSession = async () => {
    if (!session?.quiz?.questions.length) {
      alert('No hay preguntas en este quiz')
      return
    }

    const firstQuestion = session.quiz.questions[0]
    await supabase
      .from('sessions')
      .update({ status: 'running', current_question_id: firstQuestion.id, started_at: new Date().toISOString() })
      .eq('id', sessionId)

    setSession(current => ({ ...current!, status: 'running', current_question_id: firstQuestion.id }))
    fetchCurrentQuestion()
  }

  const handleNextQuestion = async () => {
    if (!session?.quiz?.questions) return

    const currentIndex = session.quiz.questions.findIndex(q => q.id === currentQuestion?.id)
    const nextIndex = currentIndex + 1

    if (nextIndex >= session.quiz.questions.length) {
      // End session
      await supabase
        .from('sessions')
        .update({ status: 'ended', current_question_id: null, ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      setSession(current => ({ ...current!, status: 'ended', current_question_id: null }))
    } else {
      const nextQuestion = session.quiz.questions[nextIndex]
      await supabase
        .from('sessions')
        .update({ current_question_id: nextQuestion.id })
        .eq('id', sessionId)
      setSession(current => ({ ...current!, current_question_id: nextQuestion.id }))
      fetchCurrentQuestion()
    }
  }

  const handlePauseSession = async () => {
    await supabase
      .from('sessions')
      .update({ status: 'paused' })
      .eq('id', sessionId)
    setSession(current => ({ ...current!, status: 'paused' }))
    setTimeRemaining(null)
  }

  const handleResumeSession = async () => {
    await supabase
      .from('sessions')
      .update({ status: 'running' })
      .eq('id', sessionId)
    setSession(current => ({ ...current!, status: 'running' }))
    if (currentQuestion) {
      startTimer(timeRemaining || currentQuestion.time_limit_sec)
    }
  }

  const handleEndSession = async () => {
    if (confirm('¿Estás seguro de que quieres finalizar la sesión?')) {
      await supabase
        .from('sessions')
        .update({ status: 'ended', current_question_id: null, ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      setSession(current => ({ ...current!, status: 'ended', current_question_id: null }))
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

  if (loading || !session || !isHost) return <div className="p-6">Cargando...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => router.push('/sessions')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Sala de Control - Sesión {session.code}</h1>
          <p className="text-gray-600">{session.quiz?.title}</p>
          <div className="flex items-center gap-2 mt-2">
            {getStatusBadge(session.status)}
            <Badge variant="outline">{session.quiz?.questions.length} preguntas</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Participants */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participantes ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay participantes aún</p>
            ) : (
              <div className="space-y-2">
                {participants.map((participant) => (
                  <div key={participant.id} className="flex justify-between items-center">
                    <span className="text-sm">{participant.alias}</span>
                    <Badge variant="outline">{participant.score} pts</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Question */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Estado Actual</span>
              {session.status === 'running' && timeRemaining !== null && (
                <Badge variant={timeRemaining <= 5 ? 'destructive' : 'default'} className="text-lg px-3 py-1">
                  <Clock className="w-4 h-4 mr-1" />
                  {timeRemaining}s
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session.status === 'lobby' && (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">Esperando participantes en el lobby</p>
                <p className="text-3xl font-bold text-blue-600 mb-6">{session.code}</p>
                <Button onClick={handleStartSession} size="lg">
                  <Play className="w-5 h-5 mr-2" />
                  Iniciar Juego
                </Button>
              </div>
            )}

            {currentQuestion && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2">{currentQuestion.text}</h3>
                  <div className="grid gap-2">
                    {currentQuestion.options.map((option) => {
                      const responseCount = currentQuestion.answers?.filter(r => r.option_id === option.id).length || 0
                      return (
                        <div key={option.id} className="flex items-center justify-between p-2 border rounded">
                          <span>{option.text}</span>
                          <div className="flex items-center gap-2">
                            {option.is_correct && <Trophy className="w-4 h-4 text-yellow-500" />}
                            <Badge variant="outline">{responseCount} respuestas</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t my-4" />

                <div className="flex justify-center gap-4">
                  {session.status === 'running' && (
                    <>
                      <Button variant="outline" onClick={handlePauseSession}>
                        <Pause className="w-4 h-4 mr-2" />
                        Pausar
                      </Button>
                      <Button onClick={handleNextQuestion}>
                        <Play className="w-4 h-4 mr-2" />
                        Siguiente Pregunta
                      </Button>
                    </>
                  )}
                  {session.status === 'paused' && (
                    <Button onClick={handleResumeSession}>
                      <Play className="w-4 h-4 mr-2" />
                      Reanudar
                    </Button>
                  )}
                  <Button variant="destructive" onClick={handleEndSession}>
                    <Square className="w-4 h-4 mr-2" />
                    Finalizar Sesión
                  </Button>
                </div>
              </div>
            )}

            {session.status === 'ended' && (
              <div className="text-center py-8">
                <h3 className="text-xl font-semibold text-green-600 mb-4">¡Sesión Finalizada!</h3>
                <p className="text-gray-600 mb-4">Todos los participantes han completado el quiz</p>
                <Button onClick={() => router.push(`/reports?sessionId=${sessionId}`)}>
                  Ver Reportes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
