'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Users, Zap, Target, Brain, Rocket, Sparkles, Play } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 relative overflow-hidden">
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-yellow-300/20 rounded-full animate-bounce"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-pink-400/10 rounded-full animate-spin [animation-duration:10s]"></div>
      </div>

      {/* Sparkle effects */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <Sparkles
            key={i}
            className={`absolute text-white/30 w-6 h-6 animate-pulse`}
            style={{
              top: `${20 + i * 15}%`,
              left: `${10 + (i * 15) % 80}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + i}s`
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Hero Section */}
        <div className={`text-center mb-12 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 mb-6 backdrop-blur-sm">
            <Rocket className="w-5 h-5 text-yellow-300" />
            <span className="text-white font-medium">MiniKahoot Contact Center</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 drop-shadow-lg">
            🚀 Aprende Jugando
          </h1>

          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl px-4 drop-shadow">
            Quiz interactivos en tiempo real para entrenar agentes de contact center. ¡Participa desde cualquier dispositivo!
          </p>
        </div>

        {/* Main Action Buttons */}
        <div className={`flex flex-col md:flex-row gap-6 mb-12 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Join Game Card */}
          <Card className="group bg-white/95 backdrop-blur-sm border-0 shadow-2xl hover:shadow-yellow-300/50 transition-all duration-300 hover:scale-105 cursor-pointer">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto bg-orange-100 p-4 rounded-full w-fit mb-4 group-hover:bg-orange-200 transition-colors">
                <Target className="w-8 h-8 text-orange-600 group-hover:scale-110 transition-transform" />
              </div>
              <CardTitle className="text-2xl text-gray-800 mb-2">🎯 Unirme al Juego</CardTitle>
              <p className="text-gray-600">Ingresa código de sala y comienza a competir</p>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/join">
                <Button
                  size="lg"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Unirme Ahora
                  <Zap className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Supervisor Card */}
          <Card className="group bg-white/95 backdrop-blur-sm border-0 shadow-2xl hover:shadow-blue-300/50 transition-all duration-300 hover:scale-105 cursor-pointer">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto bg-blue-100 p-4 rounded-full w-fit mb-4 group-hover:bg-blue-200 transition-colors">
                <Brain className="w-8 h-8 text-blue-600 group-hover:scale-110 transition-transform" />
              </div>
              <CardTitle className="text-2xl text-gray-800 mb-2">👨‍🏫 Soy Supervisor</CardTitle>
              <p className="text-gray-600">Crea quizzes y gestiona sesiones de entrenamiento</p>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                  <Trophy className="w-5 h-5 mr-2" />
                  Crear Sesión
                  <Users className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 transition-all duration-1000 delay-600 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center border border-white/20 hover:bg-white/20 transition-all duration-300">
            <Zap className="w-8 h-8 text-yellow-300 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">En Tiempo Real</h3>
            <p className="text-white/80 text-sm">Preguntas sincronizadas para toda la sala</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center border border-white/20 hover:bg-white/20 transition-all duration-300">
            <Trophy className="w-8 h-8 text-yellow-300 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">Ranking Dinámico</h3>
            <p className="text-white/80 text-sm">Posiciones actualizadas instantáneamente</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center border border-white/20 hover:bg-white/20 transition-all duration-300">
            <Users className="w-8 h-8 text-yellow-300 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">Multidispositivo</h3>
            <p className="text-white/80 text-sm">Funciona en PC, tablet y teléfono</p>
          </div>
        </div>

        {/* Footer */}
        <div className={`text-center text-white/60 transition-all duration-1000 delay-900 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm mb-4">
            Sistema de capacitación interactiva • Contact Center Training Platform
          </p>
          <p className="text-xs opacity-50">
            Desarrollado para equipos de alta performance
          </p>
        </div>
      </div>
    </div>
  )
}
