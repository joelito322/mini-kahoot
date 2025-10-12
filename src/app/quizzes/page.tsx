'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Pencil, Play, Archive, Plus, ArrowLeft, BookOpen, Calendar, Target, Wrench } from 'lucide-react'
import Link from 'next/link'

interface Quiz {
  id: string
  title: string
  category: string
  archived: boolean
  created_at: string
  questions_count?: number
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newQuiz, setNewQuiz] = useState({ title: '', category: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchQuizzes()
  }, [])

  const fetchQuizzes = async () => {
    // Get quizzes with question counts
    const { data: quizzesData, error } = await supabase.from('quizzes').select('*').eq('archived', false).order('created_at', { ascending: false })
    if (error) console.error(error)

    if (quizzesData) {
      // Get question counts for each quiz
      const quizzesWithCounts = await Promise.all(
        quizzesData.map(async (quiz) => {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('quiz_id', quiz.id)

          return {
            ...quiz,
            questions_count: count || 0
          }
        })
      )
      setQuizzes(quizzesWithCounts || [])
    } else {
      setQuizzes([])
    }
    setLoading(false)
  }

  const handleCreateQuiz = async () => {
    if (!newQuiz.title.trim() || !newQuiz.category.trim()) return

    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('Usuario no autenticado')
      setCreating(false)
      return
    }

    const { error } = await supabase.from('quizzes').insert({
      title: newQuiz.title,
      category: newQuiz.category,
      created_by: user.id
    })

    if (error) {
      console.error('Error creando quiz:', error)
      alert('Error al crear el quiz')
    } else {
      setNewQuiz({ title: '', category: '' })
      setCreateDialogOpen(false)
      fetchQuizzes()
    }
    setCreating(false)
  }

  const handleArchiveQuiz = async (quizId: string) => {
    const { error } = await supabase.from('quizzes').update({ archived: true }).eq('id', quizId)
    if (error) {
      console.error('Error archivando quiz:', error)
      alert('Error al archivar el quiz')
    } else {
      fetchQuizzes()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando quizzes...</p>
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
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Gestionar Quizzes</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Crea y administra evaluaciones interactivas para tus agentes
                </p>
              </div>
            </div>

            {/* Create Quiz Button */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Quiz
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Quiz</DialogTitle>
                  <p className="text-sm text-gray-600">Define los detalles básicos del quiz que quieres crear</p>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-sm font-medium">Título del Quiz</Label>
                    <Input
                      id="title"
                      value={newQuiz.title}
                      onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })}
                      placeholder="Ej: Atención al Cliente Básica"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category" className="text-sm font-medium">Categoría</Label>
                    <Input
                      id="category"
                      value={newQuiz.category}
                      onChange={(e) => setNewQuiz({ ...newQuiz, category: e.target.value })}
                      placeholder="Ej: Ventas, Soporte Técnico"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleCreateQuiz}
                      disabled={creating || !newQuiz.title.trim() || !newQuiz.category.trim()}
                      className="flex-1 bg-blue-500 hover:bg-blue-600"
                    >
                      {creating ? 'Creando...' : 'Crear Quiz'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">

        {/* Status Summary */}
        {quizzes.length > 0 && (
          <div className="bg-white rounded-lg border p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Resumen de Quizzes</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {quizzes.length} {quizzes.length === 1 ? 'quiz activo' : 'quizzes activos'} disponibles
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{quizzes.length}</div>
                  <div className="text-xs text-gray-600">Total</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {quizzes.length === 0 ? (
          <Card className="text-center py-12 border-2 border-dashed border-gray-300">
            <CardContent>
              <div className="mx-auto bg-gray-100 p-4 rounded-full w-fit mb-4">
                <BookOpen className="w-8 h-8 text-gray-400" />
              </div>
              <CardTitle className="text-xl text-gray-700 mb-2">No hay quizzes creados</CardTitle>
              <p className="text-gray-500 mb-6">Comienza creando tu primer quiz para entrenar a tus agentes</p>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-500 hover:bg-blue-600">
                <Plus className="w-4 h-4 mr-2" />
                Crear Mi Primer Quiz
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => (
              <Card key={quiz.id} className="group hover:shadow-lg transition-all duration-300 border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-800 mb-2 line-clamp-2">{quiz.title}</CardTitle>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                    {quiz.category}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Creado {new Date(quiz.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <Target className="w-4 h-4" />
                      <span>{quiz.questions_count || 0} {quiz.questions_count === 1 ? 'pregunta' : 'preguntas'}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex-1 text-xs"
                      >
                        <Link href={`/quizzes/${quiz.id}`}>
                          <Wrench className="w-3 h-3 mr-1" />
                          Editar
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex-1 text-xs"
                      >
                        <Link href={`/sessions/create?quizId=${quiz.id}`}>
                          <Target className="w-3 h-3 mr-1" />
                          Iniciar
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveQuiz(quiz.id)}
                        className="text-xs"
                        title="Archivar quiz"
                      >
                        <Archive className="w-3 h-3 mr-1" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
