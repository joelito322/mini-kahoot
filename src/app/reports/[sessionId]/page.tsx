'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy, Clock, Target, Medal, Users, TrendingUp, Zap } from 'lucide-react'

interface Session {
  id: string
  code: string
  quiz: {
    id: string
    title: string
  } | null
}


interface ParticipantStats {
  id: string
  alias: string
  totalScore: number
  totalTime: number // milliseconds for correct answers
  correctAnswers: number
  averageTimePerQuestion: number // milliseconds per correct answer
}

interface QuestionStats {
  questionId: string
  questionText: string
  correctAnswers: number
  totalAnswers: number
  correctPercentage: number
  averageTime: number // milliseconds
}

interface OverallStats {
  totalParticipants: number
  totalQuestions: number
  averageScore: number
  averageTimePerQuestion: number
}

export default function SessionReportPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<ParticipantStats[]>([])
  const [questions, setQuestions] = useState<QuestionStats[]>([])
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalParticipants: 0,
    totalQuestions: 0,
    averageScore: 0,
    averageTimePerQuestion: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReportData()
  }, [sessionId])

  const fetchReportData = async () => {
    try {
      // 1. Get session basic info with quiz
      const { data: sessionData } = await supabase
        .from('sessions')
        .select(`
          id,
          code,
          quiz:quizzes(id, title)
        `)
        .eq('id', sessionId)
        .single()

      if (!sessionData) {
        alert('Sesión no encontrada')
        router.push('/')
        return
      }

      // Fix quiz type issue
      const processedSession: Session = {
        ...sessionData,
        quiz: Array.isArray(sessionData.quiz) ? sessionData.quiz[0] : sessionData.quiz
      }
      setSession(processedSession)

      // 2. Get results data using same query as results page
      const { data: resultsData, error: resultsError } = await supabase
        .from('session_results')
        .select(`
          final_position,
          final_score,
          total_answers,
          correct_answers,
          total_time_ms,
          session_participants!inner(
            id,
            alias,
            user_id
          )
        `)
        .eq('session_id', sessionId)
        .order('final_position', { ascending: true })

      if (resultsError) {
        console.error('Error fetching results:', resultsError)
        alert('Error cargando resultados: ' + resultsError.message)
        return
      }

      console.log('REPORT: Results data received:', resultsData, resultsError)

      // If no results in session_results table, use fallback calculation
      const processedParticipants: ParticipantStats[] = resultsData && resultsData.length > 0 ?
        resultsData.map((result: any) => ({
          id: result.session_participants.id,
          alias: result.session_participants.alias,
          totalScore: result.final_score,
          totalTime: result.total_time_ms,
          correctAnswers: result.correct_answers,
          averageTimePerQuestion: result.correct_answers > 0 ? Math.round(result.total_time_ms / result.correct_answers) : 0
        })) : []

      // 3. Get question statistics
      const [{ data: answers, error: answersError }, { data: questions }] = await Promise.all([
        supabase.from('answers').select('time_ms, question_id, participant_id, option_id').eq('session_id', sessionId),
        supabase.from('questions').select('id, text, time_limit_sec').eq('quiz_id', processedSession.quiz?.id)
      ])

      if (answersError) {
        console.error('Error fetching answers:', answersError)
        return
      }

      // Get all options for the questions in this quiz
      const quizQuestions = questions || []
      const questionIds = quizQuestions.map(q => q.id)

      const { data: allOptions } = questionIds.length > 0 ?
        await supabase.from('options').select('id, question_id, is_correct').in('question_id', questionIds) :
        { data: [] }

      // Create lookup maps
      const questionMapById = new Map(quizQuestions.map(q => [q.id, q]))
      const optionMapById = new Map(allOptions?.map(o => [o.id, o.is_correct]) || [])

      // Process question stats
      const questionStatsMap = new Map<string, QuestionStats>()

      answers?.forEach(answer => {
        const question = questionMapById.get(answer.question_id)
        const isCorrect = optionMapById.get(answer.option_id) || false

        if (!question) return

        if (!questionStatsMap.has(answer.question_id)) {
          questionStatsMap.set(answer.question_id, {
            questionId: answer.question_id,
            questionText: question.text,
            correctAnswers: 0,
            totalAnswers: 0,
            correctPercentage: 0,
            averageTime: 0
          })
        }

        const questionStats = questionStatsMap.get(answer.question_id)!
        questionStats.totalAnswers += 1
        if (isCorrect) {
          questionStats.correctAnswers += 1
          questionStats.averageTime += answer.time_ms || 0
        }
      })

      const questionsArray = Array.from(questionStatsMap.values())
        .map(q => ({
          ...q,
          correctPercentage: q.totalAnswers > 0 ? Math.round((q.correctAnswers / q.totalAnswers) * 100) : 0,
          averageTime: q.correctAnswers > 0 ? Math.round(q.averageTime / q.correctAnswers) : 0
        }))
        .sort((a, b) => a.questionText.localeCompare(b.questionText))

      // Calculate overall stats
      const totalScore = processedParticipants.reduce((sum, p) => sum + p.totalScore, 0)
      const totalTime = processedParticipants.reduce((sum, p) => sum + p.totalTime, 0)
      const totalCorrect = processedParticipants.reduce((sum, p) => sum + p.correctAnswers, 0)

      setParticipants(processedParticipants)
      setQuestions(questionsArray)
      setOverallStats({
        totalParticipants: processedParticipants.length,
        totalQuestions: questionsArray.length,
        averageScore: processedParticipants.length > 0 ? Math.round(totalScore / processedParticipants.length) : 0,
        averageTimePerQuestion: totalCorrect > 0 ? Math.round(totalTime / totalCorrect) : 0
      })

    } catch (error) {
      console.error('Error fetching report data:', error)
      alert('Error cargando reportes')
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `${position}º`
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000)
    return `${seconds}s`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando reportes...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <div className="p-6">Sesión no encontrada</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
            <div>
              <h1 className="font-bold text-xl">Reportes de Sesión</h1>
              <p className="text-sm text-gray-600">Sala {session.code} - {session.quiz?.title}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{overallStats.totalParticipants}</p>
                  <p className="text-sm text-gray-600">Participantes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{overallStats.totalQuestions}</p>
                  <p className="text-sm text-gray-600">Preguntas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Medal className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold">{overallStats.averageScore}</p>
                  <p className="text-sm text-gray-600">Puntaje Promedio</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">{formatTime(overallStats.averageTimePerQuestion)}</p>
                  <p className="text-sm text-gray-600">Tiempo Promedio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Final Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-600" />
              Ranking Final
            </CardTitle>
            <p className="text-sm text-gray-600">
              Ordenado por puntos descendentemente, luego por tiempo de respuesta ascendentemente
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {participants.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No hay resultados disponibles aún. Esta sesión debe terminar para mostrar los rankings.
                </p>
              ) : (
                participants.slice(0, 10).map((participant, index) => {
                  const position = index + 1
                  return (
                    <div key={participant.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={position <= 3 ? 'default' : 'outline'} className="w-8 h-8 p-0 flex items-center justify-center text-sm">
                          {getRankIcon(position)}
                        </Badge>
                        <div>
                          <p className="font-semibold">{participant.alias}</p>
                          <p className="text-sm text-gray-600">
                            {participant.totalScore} puntos • {participant.correctAnswers} correctas
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <Clock className="h-4 w-4 mx-auto text-gray-500" />
                            <p className="text-sm">{formatTime(participant.averageTimePerQuestion)}</p>
                            <p className="text-xs text-gray-500">avg/question</p>
                          </div>
                          <div className="text-center">
                            <TrendingUp className="h-4 w-4 mx-auto text-gray-500" />
                            <p className="text-sm">{participant.totalScore}</p>
                            <p className="text-xs text-gray-500">total</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }))}
            </div>
          </CardContent>
        </Card>

        {/* Question-by-Question Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6 text-green-600" />
              Estadísticas por Pregunta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.questionId} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-semibold text-lg">
                      {index + 1}. {question.questionText}
                    </h4>
                    <div className="text-right">
                      <Badge variant="outline" className="text-lg">
                        {question.correctPercentage}%
                      </Badge>
                      <p className="text-sm text-gray-600 mt-1">
                        {question.correctAnswers}/{question.totalAnswers} correctos
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Porcentaje correcto</span>
                      <span>{question.correctPercentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${question.correctPercentage}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Tiempo promedio de respuestas correctas</span>
                      <span>{formatTime(question.averageTime)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="flex justify-center">
          <Button onClick={() => router.push('/dashboard')} size="lg">
            Nuevo Juego
          </Button>
        </div>
      </div>
    </div>
  )
}
