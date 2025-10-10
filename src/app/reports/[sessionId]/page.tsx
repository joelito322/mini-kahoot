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
      // 1. Get session basic info
      const { data: sessionData } = await supabase
        .from('sessions')
        .select(`
          id,
          code,
          quiz:quizzes(title)
        `)
        .eq('id', sessionId)
        .single()

      if (!sessionData) {
        alert('Sesión no encontrada')
        router.push('/')
        return
      }

      const processedSession: Session = {
        ...sessionData,
        quiz: sessionData.quiz ? (Array.isArray(sessionData.quiz) ? sessionData.quiz[0] : sessionData.quiz) : null
      }
      setSession(processedSession)

      // 2. Get all answers with question details and user info
      const { data: answers, error: answersError } = await supabase
        .from('answers')
        .select(`
          time_ms,
          score_value:scores!inner(score),
          question:questions(id, text, time_limit_sec),
          participant:session_participants(id, alias, user_id),
          option:options(is_correct)
        `)
        .eq('session_id', sessionId)

      if (answersError) {
        console.error('Error fetching answers:', answersError)
        return
      }

      // Process answers to get participant stats
      const participantMap = new Map<string, ParticipantStats>()
      const questionMap = new Map<string, QuestionStats>()

      answers?.forEach((answer: any) => {
        const participantId = answer.participant.id
        const participantAlias = answer.participant.alias
        const questionId = answer.question.id
        const questionText = answer.question.text
        const timeMs = answer.time_ms || 0
        const isCorrect = answer.option.is_correct
        const scoreValue = answer.score_value?.score || 0

        // Update participant stats
        if (!participantMap.has(participantId)) {
          participantMap.set(participantId, {
            id: participantId,
            alias: participantAlias,
            totalScore: 0,
            totalTime: 0,
            correctAnswers: 0,
            averageTimePerQuestion: 0
          })
        }

        const participantStats = participantMap.get(participantId)!
        participantStats.totalScore += scoreValue

        if (isCorrect) {
          participantStats.correctAnswers += scoreValue > 0 ? 1 : 0
          participantStats.totalTime += timeMs
        }

        // Update question stats
        if (!questionMap.has(questionId)) {
          questionMap.set(questionId, {
            questionId,
            questionText,
            correctAnswers: 0,
            totalAnswers: 0,
            correctPercentage: 0,
            averageTime: 0
          })
        }

        const questionStats = questionMap.get(questionId)!
        questionMap.set(questionId, {
          ...questionStats,
          totalAnswers: questionStats.totalAnswers + 1,
          averageTime: questionStats.averageTime + (isCorrect ? timeMs / questionStats.totalAnswers : 0),
          correctAnswers: questionStats.correctAnswers + (isCorrect ? 1 : 0)
        })
      })

      // Calculate final stats
      const participantsArray = Array.from(participantMap.values())
        .map(p => ({
          ...p,
          averageTimePerQuestion: p.correctAnswers > 0 ? Math.round(p.totalTime / p.correctAnswers) : 0
        }))
        .sort((a, b) => {
          // Sort by totalScore DESC, then by totalTime ASC (faster is better)
          if (a.totalScore !== b.totalScore) {
            return b.totalScore - a.totalScore
          }
          return a.totalTime - b.totalTime
        })

      const questionsArray = Array.from(questionMap.values()).map(q => ({
        ...q,
        correctPercentage: q.totalAnswers > 0 ? Math.round((q.correctAnswers / q.totalAnswers) * 100) : 0,
        averageTime: q.totalAnswers > 0 ? Math.round(q.averageTime / q.totalAnswers) : 0
      })).sort((a, b) => a.questionText.localeCompare(b.questionText))

      // Calculate overall stats
      const totalScore = participantsArray.reduce((sum, p) => sum + p.totalScore, 0)
      const totalTime = participantsArray.reduce((sum, p) => sum + p.totalTime, 0)
      const totalCorrect = participantsArray.reduce((sum, p) => sum + p.correctAnswers, 0)

      setParticipants(participantsArray)
      setQuestions(questionsArray)
      setOverallStats({
        totalParticipants: participantsArray.length,
        totalQuestions: questionsArray.length,
        averageScore: participantsArray.length > 0 ? Math.round(totalScore / participantsArray.length) : 0,
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
              {participants.slice(0, 10).map((participant, index) => {
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
              })}
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
                      <span>Tiempo promedio incorrecto</span>
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
