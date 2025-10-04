import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <h1 className="text-4xl font-bold mb-8 text-center">MiniKahoot para Contact Center</h1>
      <div className="flex flex-col md:flex-row gap-6">
        <Card className="w-full max-w-80">
          <CardHeader>
            <CardTitle>Supervisors</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Crea quizzes y inicia sesiones para entrenar agentes.</p>
            <Link href="/login">
              <Button className="w-full mt-4">Crear Sala</Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="w-full max-w-80">
          <CardHeader>
            <CardTitle>Agentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Únete a una sesión con código y responde preguntas en tiempo real.</p>
            <Link href="/join">
              <Button className="w-full mt-4">Unirse a Sala</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      <p className="mt-8 text-center">
        ¿Ya tienes cuenta? <Link href="/login" className="text-blue-500">Inicia sesión</Link> | <Link href="/signup" className="text-blue-500">Regístrate</Link>
      </p>
    </div>
  )
}
