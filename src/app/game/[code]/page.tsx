'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy, Clock, Users } from 'lucide-react'

interface Session {
  id: string
  code: string
  status: string
  current_question_id: string | null
}

interface Question {
  id: string
  text: string
  time_limit_sec: number
  options: Array<{
    id: string
    text: string
    is_correct?: boolean // Only shown at end
  }>
}

interface Participant {
  id: string
  alias: string
  score: number
}

interface MyParticipation {
  id: string
  alias: string
  score: number
}

export default function GamePage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [session, setSession] = useState<Session | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myParticipation, setMyParticipation] = useState<MyParticipation | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string } | null>(null)

  useEffect(() => {
    const getUserAndSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, code, status, current_question_id')
        .eq('code', code)
        .single()

      if (sessionError || !sessionData) {
        alert('Sesión no encontrada')
        router.push('/')
        return
      }

      setSession(sessionData)

      // Check if user is participating (get from localStorage for multiple participants)
      const participantId = typeof window !== 'undefined' ? localStorage.getItem('participant_id') : null
      if (!participantId) {
        console.log('No participant ID, redirect to join')
        router.push(`/join?code=${code}`)
        return
      }

      const { data: participation, error: partError } = await supabase
        .from('session_participants')
        .select(`
          id,
          alias,
          scores!inner(session_id, score)
        `)
        .eq('id', participantId)
        .eq('session_id', sessionData.id)
        .eq('scores.session_id', sessionData.id)
        .single()

      if (partError || !participation) {
        // Clear localStorage if invalid
        if (typeof window !== 'undefined') localStorage.removeItem('participant_id')
        alert('No estás inscrito en esta sesión')
        router.push(`/join?code=${code}`)
        return
      }

      setMyParticipation({
        id: participation.id,
        alias: participation.alias,
        score: participation.scores?.[0]?.score || 0
      })

      setupRealtimeSubscription(sessionData.id, participation.id)

      if (sessionData.status === 'running' && sessionData.current_question_id) {
        console.log('Initial question load:', sessionData.current_question_id)
        fetchCurrentQuestion(sessionData.id)
      } else {
        console.log('Initial status not running or no question')
      }
      fetchParticipants(sessionData.id)
      fetchCurrentQuestion(sessionData.id)
      setLoading(false)
    }

    getUserAndSession()

    // Removed realtime cleanup
  }, [code, router])

  // Polling como respaldo para session updates cuando realtime falla
  useEffect(() => {
    if (!session?.id) return

    console.log('Starting polling backup for session:', session.id)
    const polling = setInterval(async () => {
      try {
        const { data: latestSession } = await supabase
          .from('sessions')
          .select('id, status, current_question_id')
          .eq('id', session.id)
          .single()

        if (latestSession &&
           (latestSession.status !== session.status || latestSession.current_question_id !== session.current_question_id)) {
          console.log('Polling detected change:', {
            status: {new: latestSession.status, old: session.status},
            question_id: {new: latestSession.current_question_id, old: session.current_question_id}
          })
          setSession(current => ({ ...current!, ...latestSession }))

          if (latestSession.current_question_id && latestSession.current_question_id !== session.current_question_id) {
            console.log('Polling fetching new question:', latestSession.current_question_id)
            fetchCurrentQuestionById(latestSession.current_question_id)
          }
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 3000)

    return () => clearInterval(polling)
  }, [session?.id, session?.status, session?.current_question_id])

  const fetchParticipants = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('session_participants')
      .select(`
        id, alias,
        scores!inner(session_id, score)
      `)
      .eq('session_id', sessionId)
      .eq('scores.session_id', sessionId)
      .order('id') // Simple order since scores order doesn't work

    if (error) {
      console.error('Error fetching participants:', error)
    } else {
      const processedParticipants = data?.map(p => ({
        id: p.id,
        alias: p.alias,
        score: p.scores?.[0]?.score || 0
      })).sort((a, b) => b.score - a.score) || [] // Sort by score in JS
      setParticipants(processedParticipants)
    }
  }

  const fetchCurrentQuestion = async (sessionId: string) => {
    console.log('fetchCurrentQuestion called with id:', session?.current_question_id)
    if (!session?.current_question_id) {
      console.log('No current question id')
      setQuestion(null)
      setTimeRemaining(null)
      setAnswered(false)
      setSelectedOption(null)
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, time_limit_sec,
        options(id, text)
      `)
      .eq('id', session.current_question_id)
      .single()

    if (error) {
      console.error('Error fetching question:', error)
      setQuestion(null)
    } else {
      console.log('Question loaded:', data.text)
      setQuestion(data)
      setTimeRemaining(data.time_limit_sec)
      setAnswered(false)
      setSelectedOption(null)
      startTimer(data.time_limit_sec)
    }
  }

  const fetchCurrentQuestionById = async (questionId: string) => {
    console.log('fetchCurrentQuestionById called with ID:', questionId)

    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, time_limit_sec,
        options(id, text)
      `)
      .eq('id', questionId)
      .single()

    console.log('Fetch by ID result:', data, 'error:', error)
    if (error) {
      console.error('Error fetching current question by ID:', error)
      setQuestion(null)
    } else {
      console.log('Setting current question by ID:', data.text)
      setQuestion(data)
      setTimeRemaining(data.time_limit_sec)
      setAnswered(false)
      setSelectedOption(null)
      startTimer(data.time_limit_sec)
    }
  }

  const setupRealtimeSubscription = (sessionId: string, participantId: string) => {
    // Subscribe to session updates
    supabase
      .channel('game-session-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, (payload: any) => {
        if (payload.new) {
          console.log('Session realtime update:', payload.new.status, payload.new.current_question_id)
          const newSession = payload.new as Session
          setSession(current => ({ ...current!, ...newSession }))

          // If there's a new question ID (session started), fetch it immediately
          if (payload.new.current_question_id) {
            console.log('New question detected, fetching:', payload.new.current_question_id)
            fetchCurrentQuestionById(payload.new.current_question_id)
          }
        }
      })
      .subscribe()

    // Subscribe to participants updates
    supabase
      .channel('game-participants-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, () => {
        fetchParticipants(sessionId)
      })
      .subscribe()

    // Subscribe to scores updates
    supabase
      .channel('game-scores-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores',
        filter: `session_id=eq.${sessionId}`
      }, (payload: any) => {
        fetchParticipants(sessionId)
        // Check if it's my score
        if (payload.new && payload.new.participant_id === participantId) {
          setMyParticipation(current => ({ ...current!, score: payload.new.score }))
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
          setAnswered(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleAnswerSelect = async (optionId: string) => {
    if (answered || !question || !session || !myParticipation) return

    setSelectedOption(optionId)
    setAnswered(true)

    const timeMs = (timeRemaining || 0) * 1000

    const { error } = await supabase
      .from('answers')
      .insert({
        session_id: session.id,
        question_id: question.id,
        participant_id: myParticipation.id,
        option_id: optionId,
        time_ms: timeMs
      })

    if (error) {
      console.error('Error submitting answer:', error)
    }
  }

  const getRankingText = () => {
    if (!myParticipation || !participants.length) return ''

    const myRank = participants.findIndex(p => p.id === myParticipation.id) + 1
    if (myRank === 0) return ''

    return `${myRank}º lugar`
  }

  if (loading || !session || !myParticipation) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Conectando a la sesión...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Salir
            </Button>
            <div>
              <h1 className="font-bold text-xl">Sala {session.code}</h1>
              <p className="text-sm text-gray-600">{myParticipation.alias}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-semibold">{myParticipation.score} pts</p>
              {participants.length > 1 && (
                <p className="text-xs text-gray-600">{getRankingText()}</p>
              )}
            </div>
            {session.status === 'running' && timeRemaining !== null && timeRemaining > 0 && (
              <Badge variant={timeRemaining <= 5 ? 'destructive' : 'default'} className="text-lg px-3 py-1">
                <Clock className="w-4 h-4 mr-1" />
                {timeRemaining}s
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6">
        {session.status === 'lobby' && (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h2 className="text-2xl font-bold mb-2">Esperando que comience la sesión</h2>
              <p className="text-gray-600 mb-4">La partida comenzará pronto. ¡Prepárate!</p>
              <Badge variant="secondary">{participants.length} participantes conectados</Badge>
            </CardContent>
          </Card>
        )}

        {session.status === 'running' && !question && (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h2 className="text-2xl font-bold mb-2">Cargando pregunta...</h2>
              <p className="text-gray-600 mb-4">Por favor recarga la página si la pregunta no aparece.</p>
            </CardContent>
          </Card>
        )}

        {session.status === 'running' && question && (
          <div className="space-y-6">
            {/* Question */}
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-xl">{question.text}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {question.options.map((option) => (
                    <Button
                      key={option.id}
                      variant={
                        answered
                          ? (selectedOption === option.id
                            ? 'default'
                            : 'outline')
                          : selectedOption === option.id
                            ? 'default'
                            : 'outline'
                      }
                      disabled={answered}
                      onClick={() => handleAnswerSelect(option.id)}
                      className="h-auto p-4 text-left justify-start"
                    >
                      <span>{option.text}</span>
                    </Button>
                  ))}
                </div>

                {answered && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-green-800 font-semibold">¡Respuesta enviada!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ranking Preview */}
            {participants.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Ranking Actual
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {participants.slice(0, 5).map((participant, index) => (
                      <div key={participant.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <Badge variant={index < 3 ? 'default' : 'outline'} className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                            {index + 1}
                          </Badge>
                          <span className={participant.id === myParticipation.id ? 'font-semibold' : ''}>
                            {participant.alias}
                          </span>
                        </div>
                        <span className={participant.id === myParticipation.id ? 'font-semibold' : ''}>
                          {participant.score} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {session.status === 'ended' && (
          <Card className="text-center py-8">
            <CardContent>
              <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
              <h2 className="text-3xl font-bold mb-4">¡Sesión Finalizada!</h2>
              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-xl">Tu puntuación final:</p>
                  <p className="text-3xl font-bold text-blue-600">{myParticipation.score} puntos</p>
                </div>
                {participants.length > 1 && (
                  <div>
                    <p className="text-lg">Posición final:</p>
                    <p className="text-xl font-semibold">{getRankingText()}</p>
                  </div>
                )}
              </div>
              <Button onClick={() => router.push('/')}>Volver al inicio</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
