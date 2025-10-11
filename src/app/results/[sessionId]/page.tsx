'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Target, Zap, Users, Crown, Star } from 'lucide-react'

interface Session {
  id: string
  code: string
  quiz: {
    title: string
  } | null
}

interface Participant {
  id: string
  alias: string
  final_position: number
  final_score: number
  total_answers?: number
  correct_answers?: number
  total_time_ms?: number
}

interface MyResult {
  alias: string
  final_position: number
  final_score: number
  total_answers: number
  correct_answers: number
  total_time_ms: number
}

export default function SessionResultsPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myResult, setMyResult] = useState<MyResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessionResults()
  }, [sessionId])

  const fetchSessionResults = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get session info
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          id,
          code,
          quiz:quizzes(id, title)
        `)
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        console.error('Error fetching session:', sessionError)
        alert('Sesión no encontrada')
        return
      }

      // Fix quiz type issue
      const processedSession: Session = {
        ...sessionData,
        quiz: Array.isArray(sessionData.quiz) ? sessionData.quiz[0] : sessionData.quiz
      }

      setSession(processedSession)

      // Get all results for this session
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
        .limit(20) // Show top 20

      if (resultsError) {
        console.error('Error fetching results:', resultsError)
        return
      }

      // Process participants data and find current user
      let myResultData: MyResult | null = null
      const processedParticipants: Participant[] = resultsData?.map((result: any) => {
        const participant = {
          id: result.session_participants.id,
          alias: result.session_participants.alias,
          final_position: result.final_position,
          final_score: result.final_score,
          total_answers: result.total_answers,
          correct_answers: result.correct_answers,
          total_time_ms: result.total_time_ms
        }

        // Check if this is current user
        if (result.session_participants.user_id === user.id) {
          myResultData = participant as MyResult
        }

        return participant
      }) || []

      setParticipants(processedParticipants)
      setMyResult(myResultData)

      if (myResultData) {
        setMyResult(myResultData as MyResult)
      }

    } catch (error) {
      console.error('Error in fetchSessionResults:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMedalIcon = (position: number) => {
    switch (position) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `${position}º`
    }
  }

  const getMedalColor = (position: number) => {
    switch (position) {
      case 1: return 'text-yellow-600 border-yellow-200 bg-yellow-50'
      case 2: return 'text-gray-500 border-gray-200 bg-gray-50'
      case 3: return 'text-yellow-600 border-yellow-200 bg-yellow-50'
      default: return 'text-blue-600 border-blue-200 bg-blue-50'
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000)
    return `${seconds} seg`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando resultados...</p>
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
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800">¡Resultados Finales!</h1>
            <p className="text-gray-600">{session.quiz?.title} - Sala {session.code}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* My Result Card */}
        {myResult && (
          <Card className={`${getMedalColor(myResult.final_position)} border-2 animate-pulse`}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-6xl mb-4">{getMedalIcon(myResult.final_position)}</div>
                <h2 className="text-3xl font-bold mb-2">¡Felicitaciones {myResult.alias}!</h2>
                <p className="text-lg mb-4">
                  Terminaste en <span className="font-bold">{myResult.final_position}º lugar</span> con{' '}
                  <span className="font-bold">{myResult.final_score} puntos</span>
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-6 text-sm">
                  <div className="bg-white/50 rounded-lg p-3">
                    <Target className="w-6 h-6 mx-auto mb-1 text-green-600" />
                    <div className="font-semibold text-green-600">Correctas</div>
                    <div className="text-lg font-bold">
                      {myResult.correct_answers}/{myResult.total_answers}
                    </div>
                    <div className="text-xs text-gray-600">
                      {myResult.total_answers ? Math.round((myResult.correct_answers / myResult.total_answers) * 100) : 0}%
                    </div>
                  </div>

                  <div className="bg-white/50 rounded-lg p-3">
                    <Zap className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                    <div className="font-semibold text-purple-600">Velocidad</div>
                    <div className="text-lg font-bold">{formatTime(myResult.total_time_ms)}</div>
                    <div className="text-xs text-gray-600">tiempo total</div>
                  </div>

                  <div className="bg-white/50 rounded-lg p-3">
                    <Star className="w-6 h-6 mx-auto mb-1 text-yellow-600" />
                    <div className="font-semibold text-yellow-600">Puntuación</div>
                    <div className="text-lg font-bold">{myResult.final_score}</div>
                    <div className="text-xs text-gray-600">puntos finales</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top 3 Podium */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-center">
              <Crown className="w-6 h-6 text-yellow-600" />
              Podio Final
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {participants.slice(0, 3).map((participant, index) => (
                <div
                  key={participant.id}
                  className={`text-center p-4 rounded-lg border-2 ${getMedalColor(participant.final_position)} animate-bounce`}
                  style={{ animationDelay: `${index * 200}ms` }}
                >
                  <div className="text-4xl mb-2">{getMedalIcon(participant.final_position)}</div>
                  <div className="text-lg font-bold">{participant.alias}</div>
                  <div className="text-2xl font-semibold mt-1">{participant.final_score} pts</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Full Ranking Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-6 h-6" />
              Tabla de Posiciones Completa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-300 ${
                    participant.alias === myResult?.alias
                      ? 'bg-blue-50 border-blue-300 shadow-lg scale-105'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${getMedalColor(participant.final_position)}`}>
                      {participant.final_position}
                    </div>

                    <div>
                      <div className="font-bold text-lg">{participant.alias}</div>
                      {participant.alias === myResult?.alias && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600">
                          Tú
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {participant.final_score} pts
                    </div>
                    <div className="text-sm text-gray-600">
                      {participant.correct_answers}/{participant.total_answers} correctas
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <Button onClick={() => router.push('/')}>
            Nueva Sesión
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Compartir Resultados
          </Button>
        </div>
      </div>
    </div>
  )
}
