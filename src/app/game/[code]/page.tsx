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
function GameOptionButton({ option, index, answered, selectedOption, onSelect }: {
  option: { id: string; text: string };
  index: number;
  answered: boolean;
  selectedOption: string | null;
  onSelect: (optionId: string) => void;
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
  const icon = icons[index] || '❓'
  const colorClass = colors[index] || 'from-gray-500 to-gray-600'

  return (
    <Card
      key={option.id}
      className={`group cursor-pointer transition-all duration-300 border-0 shadow-md hover:shadow-lg
        ${answered
          ? (isSelected ? 'bg-blue-50 border-blue-500 shadow-blue-100' : 'bg-gray-50 border-gray-200')
          : isSelected ? 'bg-blue-50 border-blue-300 shadow-blue-100' : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
        }
        ${!answered ? 'hover:scale-105 hover:rotate-1' : ''}
      `}
      onClick={() => !answered && onSelect(option.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4 w-full">
          {/* Icon Badge */}
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${colorClass}
            flex items-center justify-center text-white text-lg font-bold shadow-lg group-hover:scale-110 transition-transform`}>
            {icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-base transition-colors ${
              answered
                ? isSelected ? 'text-blue-700' : 'text-gray-700'
                : isSelected ? 'text-blue-700' : 'text-gray-800 group-hover:text-blue-600'
            }`}>
              {option.text}
            </p>
          </div>

          {/* Selection Indicator */}
          {isSelected && (
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center animate-bounce">
              <span className="text-white text-sm font-bold">✓</span>
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

  // Polling agresivo cuando realtime falla para guest users
  useEffect(() => {
    if (!session?.id) return

    console.log('Starting aggressive polling backup for session:', session.id)

    // Add special polling during time-critical moments
    const polling = setInterval(async () => {
      try {
        const { data: latestSession } = await supabase
          .from('sessions')
          .select('id, status, current_question_id, time_limit_sec')
          .eq('id', session.id)
          .single()

        if (latestSession &&
           (latestSession.status !== session.status || latestSession.current_question_id !== session.current_question_id || latestSession.time_limit_sec !== session.time_limit_sec)) {
          console.log('🚨 POLLING DETECTED CHANGE:', {
            status: {new: latestSession.status, old: session.status},
            question_id: {new: latestSession.current_question_id, old: session.current_question_id},
            time_limit: {new: latestSession.time_limit_sec, old: session.time_limit_sec}
          })
          setSession(current => ({ ...current!, ...latestSession }))

          if (latestSession.current_question_id && latestSession.current_question_id !== session.current_question_id) {
            console.log('Fetching new question:', latestSession.current_question_id)
            fetchCurrentQuestionById(latestSession.current_question_id)
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
        console.error('Polling error:', error)
      }
    }, 1500) // Very frequent polling

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
                  {question.options.map((option, index) => (
                    <GameOptionButton
                      key={option.id}
                      option={option}
                      index={index}
                      answered={answered}
                      selectedOption={selectedOption}
                      onSelect={handleAnswerSelect}
                    />
                  ))}
                </div>

                {answered && (
                  <div className="mt-6 p-6 bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl text-center shadow-lg">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                        <span className="text-white text-xl font-bold">✓</span>
                      </div>
                      <div className="text-left">
                        <p className="text-green-800 font-bold text-xl">¡Respuesta enviada!</p>
                        <p className="text-green-600 text-sm">Esperando a que todos respondan...</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ranking Preview */}
            {participants.length > 0 && (
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

        {/* Session ended - auto redirect handled in polling */}
      </div>
    </div>
  )
}
