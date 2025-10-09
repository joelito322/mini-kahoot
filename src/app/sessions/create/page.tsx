'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play } from 'lucide-react'

interface Quiz {
  id: string
  title: string
  category: string
  archived: boolean
}

export default function CreateSessionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quizId = searchParams.get('quizId')

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!quizId) {
      router.push('/sessions')
      return
    }
    fetchQuiz()
  }, [quizId, router]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQuiz = async () => {
    if (!quizId) return

    const { data, error } = await supabase.from('quizzes').select('*').eq('id', quizId).single()
    if (error) {
      console.error('Error fetching quiz:', error)
      alert('Quiz no encontrado')
      router.push('/quizzes')
    } else {
      setQuiz(data)
    }
    setLoading(false)
  }

  const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const handleCreateSession = async () => {
    if (!quiz) return

    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('Usuario no autenticado')
      setCreating(false)
      return
    }

    // Ensure user has a profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is not found
      console.error('Error checking profile:', profileError)
      alert('Error al verificar perfil del usuario')
      setCreating(false)
      return
    }

    if (!profile) {
      // Create profile if missing
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: user.email?.split('@')[0] || 'Usuario',
          role: 'supervisor'
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating profile:', insertError)
        alert('Error al crear perfil del usuario')
        setCreating(false)
        return
      }
    }

    const sessionCode = generateSessionCode()

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        quiz_id: quiz.id,
        code: sessionCode,
        status: 'lobby',
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating session:', error)
      alert('Error al crear la sesión: ' + error.message)
    } else {
      // Initialize scores for the creator if they want to participate
      router.push(`/sessions/${session.id}`)
    }
    setCreating(false)
  }

  if (loading) return <div className="p-6">Cargando...</div>
  if (!quiz) return <div className="p-6">Quiz no encontrado</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => router.push('/quizzes')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Crear Sesión de Quiz</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalles del Quiz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-gray-700">Título</Label>
            <p className="text-lg font-semibold">{quiz.title}</p>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700">Categoría</Label>
            <Badge variant="secondary" className="ml-2">{quiz.category}</Badge>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">¿Qué sucede al crear la sesión?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>&bull; Se genera un código único para que los participantes se unan</li>
            <li>&bull; La sesión comienza en estado &ldquo;Lobby&rdquo; esperando participantes</li>
              <li>&bull; Podrás controlar el flujo del juego desde la sala de control</li>
              <li>&bull; Los participantes verán las preguntas en tiempo real</li>
            </ul>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleCreateSession}
              disabled={creating}
              size="lg"
              className="w-full"
            >
              {creating ? (
                'Creando sesión...'
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Crear e Iniciar Sesión
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
