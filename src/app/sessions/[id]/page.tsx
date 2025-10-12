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

  // Polling backup for participants updates when realtime fails
  useEffect(() => {
    if (!session?.id || session?.status !== 'running') return

    console.log('Setting up polling backup for participants during session')
    const polling = setInterval(async () => {
      try {
        await fetchParticipants()
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 3000)

    return () => clearInterval(polling)
  }, [session?.id, session?.status]) // eslint-disable-line react-hooks/exhaustive-deps

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
      startTimer(data.time_limit_sec) // Always start timer when starting session
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

    // Subscribe to new participant joins
    supabase
      .channel('participant-joins')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}`
      }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> }
        console.log('New participant joined:', p.new?.alias)
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

    // Subscribe to answers
    supabase
      .channel('answer-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'answers',
        filter: `session_id=eq.${sessionId}`
      }, () => {
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

        // Get correct answers by first getting answers with option details, then filtering
        const { data: answersWithOptions, error: correctError } = await supabase
          .from('answers')
          .select('time_ms, options!inner(is_correct)')
          .eq('session_id', sessionId)
          .eq('participant_id', participant.id)

        if (correctError) {
          console.error(`Correct answers query failed for participant ${participant.id}:`, correctError)
          // Continue with 0 correct answers
        }

        // Count correct answers by filtering the results
        let correctAnswers = 0
        if (answersWithOptions && answersWithOptions.length > 0) {
          correctAnswers = answersWithOptions.filter((answer: any) =>
            answer.options && Array.isArray(answer.options) && answer.options[0]?.is_correct
          ).length
        }

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

      // Calculate final rankings
      const rankings = participantsData.map(participant => {
        const totalAnswers = participant.answers?.length || 0
        const correctAnswers = participant.answers?.filter(
          (answer: any) => answer.option?.is_correct
        ).length || 0
        const totalTime = participant.answers?.reduce(
          (sum: number, answer: any) => sum + (answer.time_ms || 0), 0
        ) || 0
        const finalScore = participant.scores?.[0]?.score || 0

        console.log(`Participant ${participant.id}: ${totalAnswers} answers, ${correctAnswers} correct, ${finalScore} score, ${totalTime}ms`)

        return {
          participant_id: participant.id,
          final_score: finalScore,
          total_answers: totalAnswers,
          correct_answers: correctAnswers,
          total_time_ms: totalTime
        }
      })

      // Sort by score DESC, then by total time ASC for ties
      rankings.sort((a, b) => {
        if (a.final_score !== b.final_score) {
          return b.final_score - a.final_score
        }
        return a.total_time_ms - b.total_time_ms
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
  )
}
