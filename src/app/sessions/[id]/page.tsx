'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play, Pause, Square, Users, Clock, Trophy, Copy, Check } from 'lucide-react'
import Link from 'next/link'

interface Session {
  id: string
  code: string
  status: string
  current_question_id: string | null
  created_at: string
  time_limit_sec: number
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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchSession()
    setupRealtimeSubscription()

    return () => {
      supabase.removeAllChannels()
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling ULTRA AGRESIVO para participantes - igual que en game: 200ms
  useEffect(() => {
    if (!session?.id) return

    console.log('🚀 CONTROL ROOM: Starting ULTRA-AGGRESSIVE PARTICIPANT POLLING (200ms) for session:', session.id)

    const participantPolling = setInterval(async () => {
      try {
        await fetchParticipants()
      } catch (error) {
        console.error('❌ CONTROL ROOM: Ultra participant polling error:', error)
      }
    }, 200) // ULTRA FAST POLLING: 200ms - Same as game

    console.log('💥 CONTROL ROOM: Participant polling started with 200ms interval')

    return () => {
      console.log('🛑 CONTROL ROOM: Stopping ultra participant polling')
      clearInterval(participantPolling)
    }
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSession = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id, code, status, current_question_id, created_at, created_by, time_limit_sec,
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

    // Process quiz with questions
    const quizData = data.quiz ? data.quiz[0] || data.quiz : null
    const fullQuiz: Session['quiz'] = quizData ? {
      ...quizData,
      questions: []
    } : null

    // Fetch questions separately
    if (fullQuiz) {
      console.log('Fetching questions for quiz:', fullQuiz.id)
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select(`
          id, text, order_index, time_limit_sec,
          options(id, text, is_correct)
        `)
        .eq('quiz_id', fullQuiz.id)
        .order('order_index', { ascending: true })

      console.log('Questions result:', questionsData?.length || 0, 'questions')

      if (questionsError) {
        console.error('Questions error:', questionsError.message)
        alert('Error cargando preguntas: ' + questionsError.message)
        fullQuiz.questions = []
      } else {
        fullQuiz.questions = questionsData || []
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
    console.log('fetchCurrentQuestion called, current_question_id:', session?.current_question_id)
    if (!session?.current_question_id) {
      console.log('No current_question_id, skipping fetch')
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

    console.log('Fetch current question result:', data, 'error:', error)
    if (error) {
      console.error('Error fetching current question:', error)
    } else {
      console.log('Setting current question:', data.text)
      setCurrentQuestion(data)
      if (session.status === 'running') {
        startTimer(data.time_limit_sec)
      }
    }
  }

  const fetchCurrentQuestionById = async (questionId: string) => {
    console.log('fetchCurrentQuestionById called with ID:', questionId)

    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, time_limit_sec,
        options(id, text, is_correct),
        answers(participant_id, option_id, time_ms)
      `)
      .eq('id', questionId)
      .single()

    console.log('Fetch by ID result:', data, 'error:', error)
    if (error) {
      console.error('Error fetching current question by ID:', error)
      setCurrentQuestion(null)
    } else {
      console.log('Setting current question by ID:', data.text)
      setCurrentQuestion(data)
      startTimer(session!.time_limit_sec) // Always start timer when starting session
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
      }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> }
        if (p.new) {
          setSession(current => ({ ...current!, ...p.new }))
        }
      })
      .subscribe()

    // Subscribe to participant updates (existing participants, score changes)
    supabase
      .channel('participant-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, () => {
        fetchParticipants()
      })
      .subscribe()

    // Subscribe to participant changes (joins and leaves)
    supabase
      .channel('participant-changes')
      .on('postgres_changes', {
        event: '*', // CATCH ALL changes: INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, (payload: unknown) => {
        const p = payload as any
        if (p.eventType === 'INSERT') {
          console.log('🎉 New participant joined:', p.new?.alias)
        } else if (p.eventType === 'DELETE') {
          console.log('👋 Participant left:', p.old?.alias)
        }
        fetchParticipants()
      })
      .subscribe()

    // Subscribe to scores updates (in case scores change)
    supabase
      .channel('scores-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores',
        filter: `session_id=eq.${sessionId}`
      }, () => {
        fetchParticipants()
      })
      .subscribe()

    // Subscribe to answers - refresh current question when new answers arrive
    supabase
      .channel('answer-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'answers',
        filter: `session_id=eq.${sessionId}`
      }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> }
        console.log('Answer update received:', p?.new?.question_id, 'current question:', currentQuestion?.id)

        // Only refresh if it's for the current question being displayed
        if (p?.new?.question_id === currentQuestion?.id) {
          console.log('Refreshing current question answers')
          if (currentQuestion) {
            fetchCurrentQuestionById(currentQuestion.id)
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
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleStartSession = async () => {
    alert('Questions in quiz: ' + session?.quiz?.questions?.length)
    if (!session?.quiz?.questions.length) {
      alert('No hay preguntas en este quiz')
      return
    }

    const firstQuestion = session.quiz.questions[0]
    console.log('Starting session, first question ID:', firstQuestion?.id)
    if (!firstQuestion?.id) {
      alert('Error: primera pregunta no tiene ID')
      return
    }

    const { data, error } = await supabase
      .from('sessions')
      .update({ status: 'running', current_question_id: firstQuestion.id, started_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('current_question_id, status')
      .single()

    if (error) {
      console.error('Error updating session:', error)
      alert('Error iniciando sesión')
      return
    }

    console.log('Session updated successfully:', data)
    setSession(current => current ? { ...current, status: data.status, current_question_id: data.current_question_id } : current)

    // Fetch current question using the confirmed ID from DB
    if (data.current_question_id) {
      fetchCurrentQuestionById(data.current_question_id)
    }
  }

  const handleNextQuestion = async () => {
    if (!session?.quiz?.questions) return

    const currentIndex = session.quiz.questions.findIndex(q => q.id === currentQuestion?.id)
    const nextIndex = currentIndex + 1

    console.log('Next question: currentIndex', currentIndex, 'nextIndex', nextIndex, 'total questions', session.quiz.questions.length)

    if (nextIndex >= session.quiz.questions.length) {
      // End session
      await supabase
        .from('sessions')
        .update({ status: 'ended', current_question_id: null, ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      setSession(current => ({ ...current!, status: 'ended', current_question_id: null }))
    } else {
      const nextQuestion = session.quiz.questions[nextIndex]
      console.log('Moving to next question:', nextQuestion.id, nextQuestion.text)
      await supabase
        .from('sessions')
        .update({ current_question_id: nextQuestion.id })
        .eq('id', sessionId)
      setSession(current => ({ ...current!, current_question_id: nextQuestion.id }))

      // Fetch the next question immediately to avoid timing issues
      fetchCurrentQuestionById(nextQuestion.id)
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

  const isLastQuestion = () => {
    if (!session?.quiz?.questions || !currentQuestion) return false
    const currentIndex = session.quiz.questions.findIndex(q => q.id === currentQuestion.id)
    return currentIndex === session.quiz.questions.length - 1
  }

  const calculateAndSaveFinalRankings = async () => {
    try {
      console.log('Starting to calculate final rankings for session:', sessionId)

      // First get all scores for this session to find participants who answered
      const { data: scoresData, error: scoresError } = await supabase
        .from('scores')
        .select('participant_id')
        .eq('session_id', sessionId)

      if (scoresError) {
        console.error('Error fetching scores:', scoresError)
        return
      }

      console.log('Found scores:', scoresData?.length)

      if (!scoresData || scoresData.length === 0) {
        console.warn('No scores found - no participants answered')
        return
      }

      // Get unique participant IDs
      const participantIds = Array.from(new Set(scoresData.map(s => s.participant_id)))

      console.log('Unique participant IDs:', participantIds)

      // Now get participant details
      const { data: participants, error: participantsError } = await supabase
        .from('session_participants')
        .select('id, user_id')
        .in('id', participantIds)

      if (participantsError) {
        console.error('Error fetching participants:', participantsError)
        return
      }

      console.log('Found participants:', participants?.length)

      if (!participants || participants.length === 0) {
        console.warn('No participants found')
        return
      }

      // For each participant, get their scores and answers
      const participantsData = []

      for (const participant of participants) {
        console.log(`Processing participant ${participant.id}`)

        // Get score with error handling (get the latest score)
        const { data: scoreData, error: scoreError } = await supabase
          .from('scores')
          .select('score')
          .eq('session_id', sessionId)
          .eq('participant_id', participant.id)
          .order('last_update', { ascending: false })
          .limit(1)

        if (scoreError) {
          console.error(`Score query failed for participant ${participant.id}:`, scoreError)
          // Skip participant if score query fails
          continue
        }

        const latestScore = scoreData && scoreData.length > 0 ? scoreData[0].score : 0
        console.log(`Latest score for participant ${participant.id}: ${latestScore}`)

        // Get total answers count directly
        const { data: answersCountData, error: countError } = await supabase
          .from('answers')
          .select('id', { count: 'exact' })
          .eq('session_id', sessionId)
          .eq('participant_id', participant.id)

        if (countError) {
          console.error(`Answers count failed for participant ${participant.id}:`, countError)
          continue
        }

        let totalAnswers = answersCountData ? answersCountData.length : 0

        // Get correct answers by counting answers with correct options
        // Better approach: get the answer count and join with options in memory
        const { data: participantAnswers, error: correctError } = await supabase
          .from('answers')
          .select('option_id')
          .eq('session_id', sessionId)
          .eq('participant_id', participant.id)

        if (correctError) {
          console.error(`Correct answers query failed for participant ${participant.id}:`, correctError)
        }

        // Now check how many of those option_ids are correct
        let correctAnswers = 0
        if (participantAnswers && participantAnswers.length > 0) {
          // Get the option_ids and check which are correct in a batch query
          const optionIds = participantAnswers.map(a => a.option_id)
          const { data: correctOptions, error: optionsError } = await supabase
            .from('options')
            .select('id')
            .in('id', optionIds)
            .eq('is_correct', true)

          if (optionsError) {
            console.error(`Options query failed for participant ${participant.id}:`, optionsError)
          } else if (correctOptions) {
            correctAnswers = correctOptions.length
          }
        }

        console.log(`Participant ${participant.id}: ${participantAnswers?.length || 0} total answers, ${correctAnswers} correct answers`)

        // Get total time spent
        const { data: timeData, error: timeError } = await supabase
          .from('answers')
          .select('time_ms')
          .eq('session_id', sessionId)
          .eq('participant_id', participant.id)

        if (timeError) {
          console.error(`Time query failed for participant ${participant.id}:`, timeError)
        }

        let totalTime = 0
        if (timeData && timeData.length > 0) {
          for (const entry of timeData) {
            totalTime += entry.time_ms || 0
          }
        }

        console.log(`Stats for ${participant.id}: ${totalAnswers} answers, ${correctAnswers} correct, ${totalTime}ms total`)

        participantsData.push({
          ...participant,
          scores: [{ score: latestScore }],
          answers: [], // No necesitamos array completo, solo stats
          total_answers: totalAnswers,
          correct_answers: correctAnswers,
          total_time_ms: totalTime,
          final_score: latestScore // Use the latest score directly
        })
      }

      console.log('Processed participants data:', participantsData.length)

      if (participantsData.length === 0) {
        console.warn('No participants data found after processing')
        return
      }

      // Calculate final rankings using pre-computed stats
      const rankings = participantsData.map(participant => {
        console.log(`Participant ${participant.id}: ${participant.total_answers} answers, ${participant.correct_answers} correct, ${participant.final_score} score, ${participant.total_time_ms}ms total`)

        return {
          participant_id: participant.id,
          final_score: participant.final_score,
          total_answers: participant.total_answers,
          correct_answers: participant.correct_answers,
          total_time_ms: participant.total_time_ms
        }
      })

      // Sort by score DESC, then by total time ASC for ties (faster = better)
      rankings.sort((a, b) => {
        if (a.final_score !== b.final_score) {
          return b.final_score - a.final_score
        }
        return b.total_time_ms - a.total_time_ms  // ✅ Menos tiempo = Mejor posición
      })

      // Assign positions and save
      const rankingData = rankings.map((ranking, index) => ({
        session_id: sessionId,
        participant_id: ranking.participant_id,
        final_position: index + 1,
        final_score: ranking.final_score,
        total_answers: ranking.total_answers,
        correct_answers: ranking.correct_answers,
        total_time_ms: ranking.total_time_ms
      }))

      console.log('Ranking data to save:', rankingData)

      const { error: insertError } = await supabase
        .from('session_results')
        .upsert(rankingData, { onConflict: 'session_id,participant_id' })

      if (insertError) {
        console.error('Error saving final rankings:', insertError)
        alert(`Error guardando rankings finales: ${insertError.message}`)
      } else {
        console.log('Final rankings saved successfully:', rankingData.length, 'participants')
      }
    } catch (error) {
      console.error('Error calculating rankings:', error)
    }
  }

  const handleEndSession = async () => {
    if (confirm('¿Estás seguro de que quieres finalizar la sesión?')) {
      console.log('Ending session and calculating rankings...')

      const { error: sessionError } = await supabase
        .from('sessions')
        .update({ status: 'ended', current_question_id: null, ended_at: new Date().toISOString() })
        .eq('id', sessionId)

      if (sessionError) {
        console.error('Error updating session:', sessionError)
        alert('Error finalizando sesión')
        return
      }

      setSession(current => ({ ...current!, status: 'ended', current_question_id: null }))

      // Calculate and save final rankings
      console.log('Starting rankings calculation...')
      await calculateAndSaveFinalRankings()
      console.log('Rankings calculation completed')
    }
  }

  const copyToClipboard = async () => {
    if (!session?.code) return

    try {
      await navigator.clipboard.writeText(session.code)
      setCopied(true)
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      alert('No se pudo copiar el código. Intenta de nuevo.')
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
          <p className="text-gray-600">Cargando sala de control...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-red-600">Sesión no encontrada</p>
        </div>
      </div>
    )
  }

  if (!isHost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-red-600">No tienes permisos para controlar esta sesión</p>
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
              <Link href="/sessions">
                <Button variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Gestionar Sesiones
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Sala de Control</h1>
                <p className="text-sm text-gray-600 mt-1">Sesión {session.code} • {session.quiz?.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  {getStatusBadge(session.status)}
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {session.quiz?.questions?.length || 0} preguntas
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">

      <div className="grid gap-6 md:grid-cols-3">
        {/* Participants - mismo estilo que en game page */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participantes ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500">Nadie se ha conectado aún</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {participants.map((participant, index) => {
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
                      className="border-0 shadow-md transition-all duration-300 hover:shadow-lg bg-white"
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
                              <span className="font-semibold truncate text-gray-800">
                                {participant.alias}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              <span className="text-xs text-green-600 font-medium">Conectado</span>
                              <Badge variant="outline" className="text-xs ml-auto">
                                {participant.score} pts
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Mensaje animado cuando hay pocos participantes - mismo que en game */}
            {participants.length > 0 && participants.length < 3 && (
              <div className="text-center py-4 border-t border-gray-100 mt-4">
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
                <div className="flex flex-col items-center gap-4 mb-6">
                  <div className="flex items-center gap-3 bg-blue-50 px-6 py-3 rounded-lg border border-blue-200">
                    <span className="text-3xl font-bold text-blue-600">{session.code}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      className="bg-white hover:bg-blue-50 border-blue-300"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2 text-green-600" />
                          <span className="text-green-600">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Código
                        </>
                      )}
                    </Button>
                  </div>
                  <Button onClick={handleStartSession} size="lg">
                    <Play className="w-5 h-5 mr-2" />
                    Iniciar Juego
                  </Button>
                </div>
              </div>
            )}

            {currentQuestion && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2">{currentQuestion.text}</h3>
                  <div className="grid gap-2">
                    {currentQuestion.options.map((option) => (
                      <div key={option.id} className="flex items-center justify-between p-2 border rounded">
                        <span>{option.text}</span>
                        {option.is_correct && <Trophy className="w-4 h-4 text-yellow-500" />}
                      </div>
                    ))}
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
                      {!isLastQuestion() && (
                        <Button onClick={handleNextQuestion}>
                          <Play className="w-4 h-4 mr-2" />
                          Siguiente Pregunta
                        </Button>
                      )}
                      {isLastQuestion() && (
                        <Button variant="destructive" onClick={handleEndSession}>
                          <Square className="w-4 h-4 mr-2" />
                          Finalizar Sesión
                        </Button>
                      )}
                    </>
                  )}
                  {session.status === 'paused' && (
                    <Button onClick={handleResumeSession}>
                      <Play className="w-4 h-4 mr-2" />
                      Reanudar
                    </Button>
                  )}
                  {!isLastQuestion() && (
                    <Button variant="destructive" onClick={handleEndSession}>
                      <Square className="w-4 h-4 mr-2" />
                      Finalizar Sesión
                    </Button>
                  )}
                </div>
              </div>
            )}

            {session.status === 'ended' && (
              <div className="text-center py-8">
                <h3 className="text-xl font-semibold text-green-600 mb-4">¡Sesión Finalizada!</h3>
                <p className="text-gray-600 mb-4">Todos los participantes han completado el quiz</p>
              <Button onClick={() => router.push(`/reports/${sessionId}`)}>
                Ver Reportes
              </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
