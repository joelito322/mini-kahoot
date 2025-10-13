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
  time_limit_sec: number
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
  revealAnswers?: boolean // Nueva propiedad para revelar respuestas
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

interface SessionResult {
  final_position: number
  final_score: number
  alias: string
}

// Component for game option buttons with unique icons
function GameOptionButton({ option, index, answered, selectedOption, onSelect, isTimeUp, correctOptionId }: {
  option: { id: string; text: string; is_correct?: boolean };
  index: number;
  answered: boolean;
  selectedOption: string | null;
  onSelect: (optionId: string) => void;
  isTimeUp: boolean;
  correctOptionId?: string;
}) {
  const icons = [
    '⬤', // Circle - Option A
    '◆',  // Square - Option B
    '▲',  // Triangle - Option C
    '◈'   // Diamond - Option D
  ]

  const colors = [
    'from-red-500 to-red-600',     // Red gradient for A
    'from-blue-500 to-blue-600',   // Blue gradient for B
    'from-green-500 to-green-600',  // Green gradient for C
    'from-purple-500 to-purple-600' // Purple gradient for D
  ]

  const isSelected = selectedOption === option.id
  const isCorrect = option.is_correct || false
  const isSelectedCorrect = isSelected && isCorrect
  const isSelectedWrong = isSelected && !isCorrect && isTimeUp
  const isCorrectOption = option.id === correctOptionId && isTimeUp
  const icon = icons[index] || '❓'
  const colorClass = colors[index] || 'from-gray-500 to-gray-600'

  return (
    <Card
      key={option.id}
      className={`group relative cursor-pointer transition-all duration-300 border-0 shadow-md hover:shadow-lg
        ${answered
          ? (isSelected ? 'bg-blue-50 border-blue-500 shadow-blue-100' : 'bg-gray-50 border-gray-200')
          : isSelected ? 'bg-blue-50 border-blue-300 shadow-blue-100' : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
        }
        ${isTimeUp ? (isCorrectOption ? 'ring-4 ring-green-500 bg-green-50 shadow-green-200' : isSelectedWrong ? 'ring-4 ring-red-500 bg-red-50 shadow-red-200' : '') : ''}
        ${!answered ? 'hover:scale-105 hover:rotate-1' : ''}
      `}
      onClick={() => !answered && onSelect(option.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4 w-full">
          {/* Icon Badge */}
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${colorClass}
            flex items-center justify-center text-white text-lg font-bold shadow-lg group-hover:scale-110 transition-transform
            ${isTimeUp ? (isCorrectOption ? 'bg-gradient-to-br from-green-500 to-green-600' : isSelectedWrong ? 'bg-gradient-to-br from-red-500 to-red-600' : '') : ''}`}>
            {icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-base transition-colors ${
              answered
                ? isSelected ? 'text-blue-700' : 'text-gray-700'
                : isSelected ? 'text-blue-700' : 'text-gray-800 group-hover:text-blue-600'
            } ${
              isTimeUp ? (isCorrectOption ? 'text-green-800 font-bold' : isSelectedWrong ? 'text-red-800 font-bold' : '') : ''
            }`}>
              {option.text}
            </p>
          </div>

          {/* Selection Indicator - Only show one check in timeup mode */}
          {isTimeUp && (
            <div className={`w-8 h-8 ${isSelectedCorrect ? 'bg-green-500' : isSelectedWrong ? 'bg-red-500' : isCorrectOption ? 'bg-green-500' : 'bg-gray-500'} rounded-full flex items-center justify-center animate-bounce shadow-lg`}>
              <span className="text-white text-sm font-bold">
                {isSelectedCorrect || isCorrectOption ? '✓' : isSelectedWrong ? '✗' : ''}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
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
  const [finalRanking, setFinalRanking] = useState<SessionResult | null>(null)
  const [finalRankings, setFinalRankings] = useState<SessionResult[]>([])

  useEffect(() => {
    const getUserAndSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      // User is optional for public sessions - set if exists
      setUser(user)

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, code, status, current_question_id, time_limit_sec')
        .eq('code', code)
        .single()

      if (sessionError || !sessionData) {
        alert('Sesión no encontrada')
        router.push('/')
        return
      }

      setSession(sessionData)

      // Check if user is participating (get from sessionStorage for multiple participants per tab)
      const participantId = typeof window !== 'undefined' ? sessionStorage.getItem('participant_id') : null
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
        // Clear sessionStorage if invalid
        if (typeof window !== 'undefined') sessionStorage.removeItem('participant_id')
        alert('No estás inscrito en esta sesión')
        router.push(`/join?code=${code}`)
        return
      }

      setMyParticipation({
        id: participation.id,
        alias: participation.alias,
        score: 0 // Start with 0, will increment on correct answers
      })

      setupRealtimeSubscription(sessionData.id, participation.id)

      // Always fetch participants, especially important for lobby state
      fetchParticipants(sessionData.id)

      if (sessionData.status === 'running' && sessionData.current_question_id) {
        console.log('Initial question load:', sessionData.current_question_id)
        fetchCurrentQuestion(sessionData.id)
      } else {
        console.log('Initial status not running or no question')
      }
      fetchCurrentQuestion(sessionData.id)
      setLoading(false)
    }

    getUserAndSession()

    // Removed realtime cleanup
  }, [code, router])

  // Polling ULTRA AGRESIVO para participantes - cada 200ms para detectar desconexiones instantáneamente
  useEffect(() => {
    if (!session?.id) return

    console.log('🚀 Starting ULTRA-AGGRESSIVE PARTICIPANT POLLING (200ms) for session:', session.id)

    const participantPolling = setInterval(async () => {
      try {
        await fetchParticipants(session.id)
      } catch (error) {
        console.error('❌ Ultra participant polling error:', error)
      }
    }, 200) // ULTRA FAST POLLING: 200ms

    console.log('💥 Participant polling started with 200ms interval')

    return () => {
      console.log('🛑 Stopping ultra participant polling')
      clearInterval(participantPolling)
    }
  }, [session?.id])

  // Polling agresivo cuando realtime falla - ultra frecuente para mantener sincronización
  useEffect(() => {
    if (!session?.id) return

    console.log('Starting session state polling...')

    // Polling ultra frecuente: cada 1000ms para estado de sesión
    const polling = setInterval(async () => {
      try {
        const { data: latestSession } = await supabase
          .from('sessions')
          .select('id, status, current_question_id, time_limit_sec')
          .eq('id', session.id)
          .single()

        if (latestSession &&
           (latestSession.status !== session.status || latestSession.current_question_id !== session.current_question_id || latestSession.time_limit_sec !== session.time_limit_sec)) {
          console.log('🚨 SESSION POLLING DETECTED CHANGE:', {
            status: {new: latestSession.status, old: session.status},
            question_id: {new: latestSession.current_question_id, old: session.current_question_id},
            time_limit: {new: latestSession.time_limit_sec, old: session.time_limit_sec}
          })
          setSession(current => ({ ...current!, ...latestSession }))

          if (latestSession.current_question_id && latestSession.current_question_id !== session.current_question_id) {
            console.log('Fetching new question:', latestSession.current_question_id)
            fetchCurrentQuestionById(latestSession.current_question_id)
          }

          // Cuando llega nueva pregunta, revelar respuestas después del tiempo límite
          if (latestSession.current_question_id && latestSession.current_question_id !== session.current_question_id) {
            // Esperar al tiempo límite y luego revelar respuestas
            if (latestSession.time_limit_sec && latestSession.time_limit_sec > 0) {
              setTimeout(() => {
                setQuestion(current => current ? { ...current, revealAnswers: true } : current)
              }, latestSession.time_limit_sec * 1000)
            }
          }

          // Session ended - wait for rankings to be calculated before redirect
          if (latestSession.status === 'ended') {
            console.log('⚠️ SESSION ENDED - Waiting for rankings before redirect')

            // Wait for rankings to be available, then redirect
            const checkRankingsAndRedirect = async () => {
              try {
                const { data: results, error } = await supabase
                  .from('session_results')
                  .select('id')
                  .eq('session_id', session.id)

                if (!error && results && results.length > 0) {
                  console.log('🎯 Rankings ready! Redirecting to results')
                  router.push(`/results/${session.id}`)
                } else {
                  console.log('⏳ Waiting for rankings to be calculated...')
                  setTimeout(checkRankingsAndRedirect, 1500)
                }
              } catch (err) {
                console.error('Error checking rankings:', err)
                // Fallback: redirect anyway after timeout
                setTimeout(() => router.push(`/results/${session.id}`), 3000)
              }
            }

            checkRankingsAndRedirect()
            return
          }
        }
      } catch (error) {
        console.error('Ultra polling error:', error)
      }
    }, 1000) // Slower polling for session state

    return () => clearInterval(polling)
  }, [session?.id, session?.status, session?.current_question_id, router])

  // Load final rankings when session ends
  useEffect(() => {
    if (session?.status === 'ended' && session?.id && !finalRanking) {
      console.log('Session ended, loading final rankings')
      fetchFinalRankings(session.id)
    }
  }, [session?.status, session?.id, finalRanking])

  // Load final rankings when session ends
  useEffect(() => {
    if (session?.status === 'ended' && session?.id && !finalRanking) {
      console.log('Session ended, loading final rankings')
      fetchFinalRankings(session.id)
    }
  }, [session?.status, session?.id, finalRanking])

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
      })).sort((a, b) => (b.score !== a.score ? b.score - a.score : a.alias.localeCompare(b.alias))) || [] // Sort by score DESC, then alias ASC
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
      setTimeRemaining(session!.time_limit_sec)
      setAnswered(false)
      setSelectedOption(null)
      startTimer(session!.time_limit_sec)
    }
  }

  const fetchCurrentQuestionById = async (questionId: string) => {
    console.log('fetchCurrentQuestionById called with ID:', questionId)

    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, time_limit_sec,
        options(id, text, is_correct)
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
      setTimeRemaining(session!.time_limit_sec)
      setAnswered(false)
      setSelectedOption(null)
      startTimer(session!.time_limit_sec)
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
      }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> }
        if (p.new) {
          console.log('Session realtime update:', p.new.status, p.new.current_question_id)
          setSession(current => {
            const updated = { ...current! } as Session
            if (typeof p.new?.status === 'string') updated.status = p.new.status
            if (typeof p.new?.current_question_id === 'string' || p.new?.current_question_id === null) {
              updated.current_question_id = p.new.current_question_id as string | null
            }
            return updated
          })

          // If there's a new question ID (session started), fetch it immediately
          if (p.new && typeof p.new.current_question_id === 'string') {
            console.log('New question detected, fetching:', p.new.current_question_id)
            fetchCurrentQuestionById(p.new.current_question_id)
          }
        }
      })
      .subscribe()

    // Subscribe to participants updates (joins and leaves)
    supabase
      .channel('game-participants-changes')
      .on('postgres_changes', {
        event: '*', // CATCH ALL changes: INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, (payload: unknown) => {
        const p = payload as any
        if (p.eventType === 'INSERT') {
          console.log('🎉 GAME: New participant joined:', p.new?.alias)
        } else if (p.eventType === 'DELETE') {
          console.log('👋 GAME: Participant left:', p.old?.alias)
        }
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
      }, (payload: unknown) => {
        fetchParticipants(sessionId)
        // Check if it's my score
        const p = payload as { new?: Record<string, unknown> }
        if (p.new && typeof p.new.participant_id === 'string' && p.new.participant_id === participantId) {
          const score = p.new.score
          if (typeof score === 'number') {
            setMyParticipation(current => ({ ...current!, score }))
          }
        }
      })
      .subscribe()
  }

  const startTimer = (duration: number) => {
    setTimeRemaining(duration)
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          if (prev !== null) {
            setAnswered(true)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleAnswerSelect = async (optionId: string) => {
    if (!question || !session || !myParticipation) return

    // If already answered, don't allow changing
    if (answered) return

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
      // If duplicate key error, answer was already submitted
      if (error.code === '23505') {
        console.log('Answer already submitted, keeping selection')
        return
      }
    } else {
      // Check if answer was correct and update score
      const { data: optionData } = await supabase
        .from('options')
        .select('is_correct')
        .eq('id', optionId)
        .single()

      if (optionData?.is_correct) {
        console.log('Answer was correct! Increasing score by 100')
        setMyParticipation(prev => {
          const newScore = prev ? prev.score + 100 : 100
          // Update score in database too
          supabase
            .from('scores')
            .upsert({
              session_id: session.id,
              participant_id: prev?.id || '',
              score: newScore
            }, {
              onConflict: 'session_id,participant_id'
            })
            .then(() => console.log('Score updated in DB'))
          return prev ? { ...prev, score: newScore } : prev
        })
      }
    }
  }

  const fetchFinalRankings = async (sessionId: string) => {
    try {
      const { data: sessionResults, error } = await supabase
        .from('session_results')
        .select(`
          final_position,
          final_score,
          session_participants!inner(alias)
        `)
        .eq('session_id', sessionId)
        .order('final_position', { ascending: true })

      if (error) {
        console.error('Error fetching final rankings:', error)
        // Fallback: show placeholder ranking
        setFinalRanking(null)
        setFinalRankings([])
        return
      }

      if (!sessionResults || sessionResults.length === 0) {
        console.log('No final rankings found yet, session_results table is empty')
        return
      }

      // Process rankings
      const processedRankings = sessionResults.map((result: any) => ({
        final_position: result.final_position,
        final_score: result.final_score,
        alias: result.session_participants.alias
      }))

      setFinalRankings(processedRankings)

      // Find my ranking
      const myResult = processedRankings.find(r => r.alias === myParticipation?.alias)
      setFinalRanking(myResult || null)

      console.log('Final rankings loaded:', processedRankings.length, 'participants')
    } catch (error) {
      console.error('Error in fetchFinalRankings:', error)
    }
  }

  const getRankingText = () => {
    if (!myParticipation || !participants.length) return ''

    const myRank = participants.findIndex(p => p.id === myParticipation.id) + 1
    if (myRank === 0) return ''

    return `${myRank}º lugar`
  }

  const getFinalRankingText = () => {
    if (!finalRanking) return 'Cargando posición...'

    const position = finalRanking.final_position
    const suffix = position === 1 ? 'ro' : position === 2 ? 'do' : position === 3 ? 'ro' : 'to'
    return `${position}º lugar`
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
              <p className="text-xs text-gray-600">{getRankingText()}</p>
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
          <div className="space-y-6">
            <Card className="text-center py-8">
              <CardContent>
                <Users className="w-16 h-16 mx-auto mb-4 text-blue-600" />
                <h2 className="text-2xl font-bold mb-2">Esperando que comience la sesión</h2>
                <p className="text-gray-600">La partida comenzará pronto. ¡Prepárate!</p>
              </CardContent>
            </Card>

            {/* Lista de participantes conectados */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Participantes Conectados ({participants.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {participants.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500">Nadie se ha conectado aún</p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {participants.map((participant, index) => {
                      const isMe = myParticipation && participant.id === myParticipation.id
                      const colors = [
                        'from-blue-500 to-blue-600',
                        'from-green-500 to-green-600',
                        'from-purple-500 to-purple-600',
                        'from-red-500 to-red-600',
                        'from-indigo-500 to-indigo-600',
                        'from-pink-500 to-pink-600',
                        'from-teal-500 to-teal-600',
                        'from-orange-500 to-orange-600'
                      ]
                      const colorClass = colors[index % colors.length]

                      return (
                        <Card
                          key={participant.id}
                          className={`border-0 shadow-md transition-all duration-300 hover:shadow-lg ${
                            isMe ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white'
                          }`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              {/* Avatar con inicial */}
                              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass}
                                flex items-center justify-center text-white font-bold shadow-lg`}>
                                {participant.alias.charAt(0).toUpperCase()}
                              </div>

                              {/* Información del participante */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold truncate ${
                                    isMe ? 'text-blue-700' : 'text-gray-800'
                                  }`}>
                                    {participant.alias}
                                  </span>
                                  {isMe && (
                                    <Badge variant="outline" className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5">
                                      Tú
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <span className="text-xs text-green-600 font-medium">Conectado</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {/* Mensaje animado cuando hay pocos participantes */}
                {participants.length > 0 && participants.length < 3 && (
                  <div className="text-center py-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500 mb-1">
                      💡 Cuantos más participantes, más divertido será el quiz!
                    </div>
                    <div className="text-xs text-gray-400">
                      Comparta el código: <span className="font-mono font-bold text-gray-700">{session.code}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
          <div className="space-y-4">
            {/* Question */}
            <Card className="shadow-xl border-0 bg-white">
              <CardHeader className="pb-6">
                <div className="text-center space-y-2">
                  <CardTitle className="text-gray-800 text-3xl font-bold leading-tight">
                    {question.text}
                  </CardTitle>
                  <div className="flex justify-center items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-1000 ease-linear ${
                          timeRemaining && timeRemaining <= 5 ? 'bg-gradient-to-r from-red-500 to-red-600' : ''
                        }`}
                        style={{ width: answered ? '100%' : `${((question.time_limit_sec - (timeRemaining || 0)) / question.time_limit_sec) * 100}%` }}
                      ></div>
                    </div>
                    <Badge variant={timeRemaining && timeRemaining <= 5 ? 'destructive' : 'default'} className="text-sm px-3 py-1">
                      <Clock className="w-4 h-4 mr-1" />
                      {timeRemaining}s
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-8">
                <div className="grid gap-6 md:grid-cols-2">
                  {question.options.map((option, index) => {
                    const isTimeUp = question.revealAnswers || false
                    const correctOptionId = isTimeUp ? question.options.find(opt => opt.is_correct)?.id : undefined
                    return (
                      <GameOptionButton
                        key={option.id}
                        option={option}
                        index={index}
                        answered={answered}
                        selectedOption={selectedOption}
                        onSelect={handleAnswerSelect}
                        isTimeUp={isTimeUp}
                        correctOptionId={correctOptionId}
                      />
                    )
                  })}
                </div>

                {answered && (
                  <div className={`mt-6 p-6 ${question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? 'bg-gradient-to-r from-green-50 to-green-100 border border-green-200' : 'bg-gradient-to-r from-red-50 to-red-100 border border-red-200') : 'bg-gradient-to-r from-green-50 to-green-100 border border-green-200'} rounded-xl text-center shadow-lg`}>
                    <div className="flex items-center justify-center gap-3">
                      <div className={`w-12 h-12 ${question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? 'bg-green-500' : 'bg-red-500') : 'bg-green-500'} rounded-full flex items-center justify-center animate-bounce shadow-lg`}>
                        <span className="text-white text-xl font-bold">
                          {question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? '✓' : '✗') : '✓'}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className={`${question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? 'text-green-800' : 'text-red-800') : 'text-green-800'} font-bold text-xl`}>
                          {question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? '¡Respuesta correcta!' : 'Respuesta incorrecta') : '¡Respuesta enviada!'}
                        </p>
                        <p className={`${question?.revealAnswers ? (selectedOption && question.options.find(opt => opt.id === selectedOption)?.is_correct ? 'text-green-600' : 'text-red-600') : 'text-green-600'} text-sm`}>
                          {question?.revealAnswers ? 'Tiempo terminado' : 'Esperando a que todos respondan...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>


          </div>
        )}

        {/* Session ended - auto redirect handled in polling */}
      </div>
    </div>
  )
}
