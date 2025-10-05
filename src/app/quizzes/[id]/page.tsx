'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react'

interface Quiz {
  id: string
  title: string
  category: string
  archived: boolean
}

interface Question {
  id: string
  text: string
  order_index: number
  time_limit_sec: number
}

interface Option {
  id?: string
  text: string
  is_correct: boolean
}

export default function EditQuizPage() {
  const params = useParams()
  const router = useRouter()
  const quizId = params.id as string

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<(Question & { options: Option[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Quiz edit state
  const [editQuizOpen, setEditQuizOpen] = useState(false)
  const [quizForm, setQuizForm] = useState({ title: '', category: '' })

  // Question dialog states
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<(Question & { options: Option[] }) | null>(null)
  const [questionForm, setQuestionForm] = useState({
    text: '',
    time_limit_sec: 20,
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false }
    ]
  })

  useEffect(() => {
    fetchQuiz()
    fetchQuestions()
  }, [quizId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQuiz = async () => {
    const { data, error } = await supabase.from('quizzes').select('*').eq('id', quizId).single()
    if (error) {
      console.error('Error fetching quiz:', error)
      alert('Quiz no encontrado')
      router.push('/quizzes')
    } else {
      setQuiz(data)
      setQuizForm({ title: data.title, category: data.category })
    }
  }

  const fetchQuestions = async () => {
    const { data, error } = await supabase
      .from('questions')
      .select(`
        id, text, order_index, time_limit_sec,
        options (id, text, is_correct)
      `)
      .eq('quiz_id', quizId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching questions:', error)
    } else {
      setQuestions(data || [])
    }
    setLoading(false)
  }

  const handleUpdateQuiz = async () => {
    if (!quizForm.title.trim() || !quizForm.category.trim()) return

    setSaving(true)
    const { error } = await supabase.from('quizzes').update(quizForm).eq('id', quizId)

    if (error) {
      console.error('Error updating quiz:', error)
      alert('Error al actualizar el quiz')
    } else {
      setQuiz({ ...quiz!, ...quizForm })
      setEditQuizOpen(false)
      fetchQuiz()
    }
    setSaving(false)
  }

  const handleSaveQuestion = async () => {
    if (!questionForm.text.trim()) return
    if (questionForm.options.filter(o => o.text.trim()).length < 2) {
      alert('Cada pregunta debe tener al menos 2 opciones')
      return
    }
    if (!questionForm.options.some(o => o.is_correct)) {
      alert('Debe marcar al menos una opción como correcta')
      return
    }

    setSaving(true)

    if (editingQuestion) {
      // Update existing question
      const { error: questionError } = await supabase
        .from('questions')
        .update({
          text: questionForm.text,
          time_limit_sec: questionForm.time_limit_sec
        })
        .eq('id', editingQuestion.id)

      if (questionError) {
        console.error('Error updating question:', questionError)
        alert('Error al actualizar la pregunta')
        setSaving(false)
        return
      }

      // Update options
      const optionsToUpdate = questionForm.options.map((opt, index) => ({
        ...opt,
        question_id: editingQuestion.id
      }))

      for (const option of optionsToUpdate) {
        if (option.id) {
          await supabase.from('options').update({
            text: option.text,
            is_correct: option.is_correct
          }).eq('id', option.id)
        } else {
          await supabase.from('options').insert({
            question_id: editingQuestion.id,
            text: option.text,
            is_correct: option.is_correct
          })
        }
      }
    } else {
      // Create new question
      const nextOrder = questions.length

      const { data: newQuestion, error: questionError } = await supabase
        .from('questions')
        .insert({
          quiz_id: quizId,
          text: questionForm.text,
          order_index: nextOrder,
          time_limit_sec: questionForm.time_limit_sec
        })
        .select()
        .single()

      if (questionError) {
        console.error('Error creating question:', questionError)
        alert('Error al crear la pregunta')
        setSaving(false)
        return
      }

      // Create options
      const optionsToInsert = questionForm.options
        .filter(o => o.text.trim())
        .map(opt => ({
          question_id: newQuestion.id,
          text: opt.text,
          is_correct: opt.is_correct
        }))

      const { error: optionsError } = await supabase.from('options').insert(optionsToInsert)

      if (optionsError) {
        console.error('Error creating options:', optionsError)
        alert('Error al crear las opciones')
      }
    }

    resetQuestionForm()
    setQuestionDialogOpen(false)
    fetchQuestions()
    setSaving(false)
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta pregunta?')) return

    const { error } = await supabase.from('questions').delete().eq('id', questionId)

    if (error) {
      console.error('Error deleting question:', error)
      alert('Error al eliminar la pregunta')
    } else {
      fetchQuestions()
    }
  }

  const resetQuestionForm = () => {
    setQuestionForm({
      text: '',
      time_limit_sec: 20,
      options: [
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false }
      ]
    })
    setEditingQuestion(null)
  }

  const openQuestionDialog = (question?: Question & { options: Option[] }) => {
    if (question) {
      setEditingQuestion(question)
      setQuestionForm({
        text: question.text,
        time_limit_sec: question.time_limit_sec,
        options: question.options.length === 4
          ? question.options.map(opt => ({ id: opt.id, text: opt.text, is_correct: opt.is_correct }))
          : [
              ...question.options.map(opt => ({ id: opt.id, text: opt.text, is_correct: opt.is_correct })),
              { text: '', is_correct: false },
              { text: '', is_correct: false },
              { text: '', is_correct: false }
            ].slice(0, 4)
      })
    } else {
      resetQuestionForm()
    }
    setQuestionDialogOpen(true)
  }

  if (loading || !quiz) return <div className="p-6">Cargando...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => router.push('/quizzes')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <Badge variant="secondary">{quiz.category}</Badge>
        </div>
        <Dialog open={editQuizOpen} onOpenChange={setEditQuizOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              Editar Quiz
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Quiz</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={quizForm.title}
                  onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="category">Categoría</Label>
                <Input
                  id="category"
                  value={quizForm.category}
                  onChange={(e) => setQuizForm({ ...quizForm, category: e.target.value })}
                />
              </div>
              <Button onClick={handleUpdateQuiz} disabled={saving} className="w-full">
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Preguntas ({questions.length})</h2>
          <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openQuestionDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Pregunta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingQuestion ? 'Editar Pregunta' : 'Nueva Pregunta'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="question-text">Texto de la pregunta</Label>
                  <Textarea
                    id="question-text"
                    value={questionForm.text}
                    onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })}
                    placeholder="Ingrese la pregunta"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="time-limit">Tiempo límite (segundos)</Label>
                  <Input
                    id="time-limit"
                    type="number"
                    min="5"
                    max="120"
                    value={questionForm.time_limit_sec}
                    onChange={(e) => setQuestionForm({ ...questionForm, time_limit_sec: parseInt(e.target.value) || 20 })}
                  />
                </div>

                <div>
                  <Label>Opciones (márquela correcta)</Label>
                  <div className="space-y-2 mt-2">
                    {questionForm.options.map((option, _index) => (
                      <div key={_index} className="flex items-center gap-2">
                        <Input
                          value={option.text}
                          onChange={(e) => {
                            const newOptions = [...questionForm.options]
                            newOptions[_index].text = e.target.value
                            setQuestionForm({ ...questionForm, options: newOptions })
                          }}
                          placeholder={`Opción ${_index + 1}`}
                        />
                        <RadioGroup
                          value={questionForm.options.findIndex(o => o.is_correct).toString()}
                          onValueChange={(value) => {
                            const newOptions = questionForm.options.map((opt, i) => ({
                              ...opt,
                              is_correct: i === parseInt(value)
                            }))
                            setQuestionForm({ ...questionForm, options: newOptions })
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value={_index.toString()} id={`correct-${_index}`} />
                          </div>
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={handleSaveQuestion} disabled={saving} className="w-full">
                  {saving ? 'Guardando...' : editingQuestion ? 'Actualizar Pregunta' : 'Crear Pregunta'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No hay preguntas en este quiz.</p>
            <Button onClick={() => openQuestionDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Crear primera pregunta
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            {questions.map((question, index) => (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">
                        Pregunta {index + 1}
                        <Badge variant="outline" className="ml-2">{question.time_limit_sec}s</Badge>
                      </CardTitle>
                      <p className="text-sm">{question.text}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openQuestionDialog(question)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteQuestion(question.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {question.options.map((option) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <Badge variant={option.is_correct ? "default" : "secondary"} className="text-xs">
                          {option.is_correct ? "✓" : "○"}
                        </Badge>
                        <span className="text-sm">{option.text}</span>
                      </div>
                    ))}
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
