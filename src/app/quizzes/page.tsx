'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Array<{id: string; title: string; category: string}>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchQuizzes = async () => {
      const { data, error } = await supabase.from('quizzes').select('*').eq('archived', false)
      if (error) console.error(error)
      else setQuizzes(data || [])
      setLoading(false)
    }
    fetchQuizzes()
  }, [])

  if (loading) return <div>Cargando quizzes...</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gestionar Quizzes</h1>
      {quizzes.length === 0 ? (
        <p>No hay quizzes creados.</p>
      ) : (
        <ul>
          {quizzes.map((quiz) => (
            <li key={quiz.id}>{quiz.title} - {quiz.category}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
