'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Pencil, Play, Archive, Plus } from 'lucide-react'
import Link from 'next/link'

interface Quiz {
  id: string
  title: string
  category: string
  archived: boolean
  created_at: string
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
    const { data, error } = await supabase.from('quizzes').select('*').eq('archived', false).order('created_at', { ascending: false })
    if (error) console.error(error)
    else setQuizzes(data || [])
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

  if (loading) return <div className="p-6">Cargando quizzes...</div>

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestionar Quizzes</h1>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Crear Quiz
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Quiz</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={newQuiz.title}
                  onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })}
                  placeholder="Ingrese el título del quiz"
                />
              </div>
              <div>
                <Label htmlFor="category">Categoría</Label>
                <Input
                  id="category"
                  value={newQuiz.category}
                  onChange={(e) => setNewQuiz({ ...newQuiz, category: e.target.value })}
                  placeholder="Ingrese la categoría"
                />
              </div>
              <Button onClick={handleCreateQuiz} disabled={creating} className="w-full">
                {creating ? 'Creando...' : 'Crear Quiz'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {quizzes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No hay quizzes creados.</p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Crear tu primer quiz
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="relative">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{quiz.title}</CardTitle>
                    <Badge variant="secondary" className="mt-1">{quiz.category}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/quizzes/${quiz.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/sessions/create?quizId=${quiz.id}`}>
                        <Play className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchiveQuiz(quiz.id)}
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Creado: {new Date(quiz.created_at).toLocaleDateString('es-ES')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
