'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Brain, Trophy, Users, BookOpen, PlayCircle, BarChart3, Target, Calendar, Zap } from 'lucide-react'
import Link from 'next/link'

interface Stats {
  totalQuizzes: number
  totalSessions: number
  activeSessions: number
  completedTrainings: number
}

export default function Dashboard() {
  const [user, setUser] = useState<{id: string; email?: string; role?: string} | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUserAndStats = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('User from auth:', user, error)

      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        console.log('Profile:', profile, profileError)

        if (profile) {
          setUser({ ...user, role: profile.role })

          // Get stats for supervisor
          if (profile.role === 'supervisor') {
            const [quizzesResult, sessionsResult] = await Promise.all([
              supabase.from('quizzes').select('id', { count: 'exact' }).eq('created_by', user.id).eq('archived', false),
              supabase.from('sessions').select('status', { count: 'exact' }).eq('created_by', user.id)
            ])

            const totalQuizzes = quizzesResult.count || 0
            const allSessions = sessionsResult.data || []
            const activeSessions = allSessions.filter(s => s.status === 'running' || s.status === 'lobby').length
            const completedSessions = allSessions.filter(s => s.status === 'ended').length

            setStats({
              totalQuizzes,
              totalSessions: allSessions.length,
              activeSessions,
              completedTrainings: completedSessions
            })
          }
        } else {
          console.error('Profile not found for user', user.id)
        }
      }

      setLoading(false)
    }

    getUserAndStats()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-red-600">Usuario no encontrado</p>
          <Link href="/login">
            <Button className="mt-4">Iniciar Sesión</Button>
          </Link>
        </div>
      </div>
    )
  }

  const isSupervisor = user.role === 'supervisor'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Inicio
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
                <p className="text-sm text-gray-600">
                  ¡Hola, {user.email}! • Rol: {isSupervisor ? 'Supervisor' : 'Agente'}
                </p>
              </div>
            </div>

            <Badge variant={isSupervisor ? "default" : "secondary"} className="px-3 py-1">
              {isSupervisor ? '👨‍🏫 Supervisor' : '👤 Agente'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">
        {isSupervisor ? (
          <div className="space-y-6">
            {/* Stats Overview */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-100 text-sm">Total Quizzes</p>
                        <p className="text-2xl font-bold">{stats.totalQuizzes}</p>
                      </div>
                      <BookOpen className="w-8 h-8 text-blue-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-cyan-100 text-sm">Sesiones Totales</p>
                        <p className="text-2xl font-bold">{stats.totalSessions}</p>
                      </div>
                      <Calendar className="w-8 h-8 text-cyan-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-green-100 text-sm">Sesiones Activas</p>
                        <p className="text-2xl font-bold">{stats.activeSessions}</p>
                      </div>
                      <PlayCircle className="w-8 h-8 text-green-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-100 text-sm">Entrenamientos Completados</p>
                        <p className="text-2xl font-bold">{stats.completedTrainings}</p>
                      </div>
                      <Trophy className="w-8 h-8 text-purple-200" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Supervisor Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto bg-blue-100 p-4 rounded-full w-fit mb-4 group-hover:bg-blue-200 transition-colors">
                    <Brain className="w-8 h-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl text-gray-800">🏆 Gestionar Quizzes</CardTitle>
                  <p className="text-gray-600 mt-2">Crea y administra exámenes interactivos para tus agentes</p>
                </CardHeader>
                <CardContent className="text-center">
                  <Link href="/quizzes">
                    <Button
                      size="lg"
                      className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                      <BookOpen className="w-5 h-5 mr-2" />
                      Ver Quizzes
                      <Target className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto bg-cyan-100 p-4 rounded-full w-fit mb-4 group-hover:bg-cyan-200 transition-colors">
                    <Users className="w-8 h-8 text-cyan-600" />
                  </div>
                  <CardTitle className="text-2xl text-gray-800">🎯 Gestionar Sesiones</CardTitle>
                  <p className="text-gray-600 mt-2">Inicia entrenamientos interactivos y supervisa el progreso</p>
                </CardHeader>
                <CardContent className="text-center">
                  <Link href="/sessions">
                    <Button
                      size="lg"
                      className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                      <PlayCircle className="w-5 h-5 mr-2" />
                      Ver Sesiones
                      <BarChart3 className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="bg-white shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-600" />
                  Actividad Reciente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">Plataforma inicializada</p>
                      <p className="text-xs text-gray-600">Sistema listo para crear el primer quiz</p>
                    </div>
                    <div className="text-xs text-gray-500">Ahora</div>
                  </div>


                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            {/* Agent Actions */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto bg-green-100 p-4 rounded-full w-fit mb-4 group-hover:bg-green-200 transition-colors">
                  <Target className="w-8 h-8 text-green-600" />
                </div>
                <CardTitle className="text-2xl text-gray-800">🎯 Unirse a Entrenamiento</CardTitle>
                <p className="text-gray-600 mt-2">Participa en evaluaciones interactivas y mejora tus habilidades</p>
              </CardHeader>
              <CardContent className="text-center">
                <Link href="/join">
                  <Button
                    size="lg"
                    className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    Entrar a Juego
                    <Zap className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Agent Stats/Info */}
            <Card className="mt-6 bg-white shadow-lg border-0">
              <CardHeader>
                <CardTitle className="text-center text-gray-800">🎓 Tu Progreso</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">0</p>
                    <p className="text-sm text-gray-600">Sesiones Completadas</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">0</p>
                    <p className="text-sm text-gray-600">Mejor Puntuación</p>
                  </div>
                </div>
                <p className="text-gray-500 text-sm">¡Completa tu primer entrenamiento para ver estadísticas!</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
