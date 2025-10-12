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

interface OptionCardProps {
  option: Option
  index: number
  isSelected: boolean
  onTextChange: (value: string) => void
  onCorrectChange: (index: number) => void
}

// Component for option cards with unique icons
function OptionCard({ option, index, isSelected, onTextChange, onCorrectChange }: OptionCardProps) {
  const icons = [
    '⬤', // Circle - Option A
    '◆',  // Square - Option B
    '▲',  // Triangle - Option C
    '◈'   // Diamond - Option D
  ]

  const colors = [
    'from-red-500 to-red-600',     // Red gradient for A
    'from-blue-500 to-blue-600',   // Blue gradient for B
    'from-green-500 to-green-600',  // Green gradient for C
    'from-purple-500 to-purple-600' // Purple gradient for D
  ]

  const icon = icons[index] || '❓'
  const colorClass = colors[index] || 'from-gray-500 to-gray-600'

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-300 ${
      isSelected
        ? 'border-blue-500 bg-blue-50 shadow-md'
        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
    }`}>
      {/* Icon Circle */}
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white text-lg font-bold shadow-lg`}>
        {icon}
      </div>

      {/* Input and Radio */}
      <div className="flex-1 min-w-0">
        <Input
          value={option.text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={`Escribe la opción ${String.fromCharCode(65 + index)}`}
          className="text-sm font-medium"
        />
      </div>

      {/* Radio Button */}
      <RadioGroup value={isSelected ? index.toString() : ""} onValueChange={() => onCorrectChange(index)}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem
            value={index.toString()}
            id={`correct-${index}`}
            className="w-4 h-4"
          />
        </div>
      </RadioGroup>
    </div>
  )
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

      // Update options - we need to match with existing options to get IDs
      const existingOptions = editingQuestion.options
      const optionsToUpdate = questionForm.options.map((opt, index) => {
        const existingOption = existingOptions[index]
        return {
          ...opt,
          id: existingOption?.id,
          question_id: editingQuestion.id
        }
      })

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando quiz...</p>
        </div>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-red-600">Quiz no encontrado</p>
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
              <Button variant="outline" onClick={() => router.push('/quizzes')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Gestionar Quizzes
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{quiz.title}</h1>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 mt-1">
                  {quiz.category}
                </Badge>
              </div>
            </div>

            <Dialog open={editQuizOpen} onOpenChange={setEditQuizOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-500 hover:bg-blue-600">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar Quiz
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar Quiz</DialogTitle>
                  <p className="text-sm text-gray-600">Modifica los detalles básicos del quiz</p>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-sm font-medium">Título del Quiz</Label>
                    <Input
                      id="title"
                      value={quizForm.title}
                      onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                      placeholder="Ej: Atención al Cliente Básica"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category" className="text-sm font-medium">Categoría</Label>
                    <Input
                      id="category"
                      value={quizForm.category}
                      onChange={(e) => setQuizForm({ ...quizForm, category: e.target.value })}
                      placeholder="Ej: Ventas, Soporte Técnico"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setEditQuizOpen(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleUpdateQuiz}
                      disabled={saving || !quizForm.title.trim() || !quizForm.category.trim()}
                      className="flex-1 bg-blue-500 hover:bg-blue-600"
                    >
                      {saving ? 'Guardando...' : 'Guardar Cambios'}
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
        <div className="bg-white rounded-lg border p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Preguntas del Quiz</h2>
              <p className="text-sm text-gray-600 mt-1">{questions.length} preguntas configuradas</p>
            </div>
            <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-500 hover:bg-blue-600">
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
                    <div className="space-y-3 mt-2">
                      {questionForm.options.map((option, _index) => (
                        <OptionCard
                          key={_index}
                          option={option}
                          index={_index}
                          isSelected={questionForm.options.findIndex(o => o.is_correct) === _index}
                          onTextChange={(value) => {
                            const newOptions = [...questionForm.options]
                            newOptions[_index].text = value
                            setQuestionForm({ ...questionForm, options: newOptions })
                          }}
                          onCorrectChange={(selectedIndex) => {
                            const newOptions = questionForm.options.map((opt, i) => ({
                              ...opt,
                              is_correct: i === selectedIndex
                            }))
                            setQuestionForm({ ...questionForm, options: newOptions })
                          }}
                        />
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
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            {questions.map((question, index) => (
              <Card key={question.id} className="hover:shadow-lg transition-all duration-300 border-0 shadow-md">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-gray-800 mb-2">
                        Pregunta {index + 1}
                        <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200">
                          {question.time_limit_sec}s
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-gray-700 line-clamp-3">{question.text}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openQuestionDialog(question)}
                        className="h-8 w-8 p-0"
                        title="Editar pregunta"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteQuestion(question.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        title="Eliminar pregunta"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {question.options.map((option, optIndex) => (
                      <div key={option.id || optIndex} className="flex items-center gap-3 p-2 rounded-md bg-gray-50">
                        <Badge variant={option.is_correct ? "default" : "outline"}
                               className={`text-xs w-6 h-6 flex items-center justify-center ${
                                 option.is_correct ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300'
                               }`}>
                          {option.is_correct ? "✓" : optIndex + 1}
                        </Badge>
                        <span className="text-sm text-gray-700 flex-1 line-clamp-1">{option.text}</span>
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
