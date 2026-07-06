// ============================================================================
// Ferremex — Animación de huella (Lottie). 3 estados mapeados a eventos del lector:
//   escaneo → esperando el dedo (loop, azul)
//   exito   → captura/verificación OK (palomita verde, se CONGELA fija)
//   error   → no reconocido / falló (círculo rojo)
//
// Config afinada en scratchpad/lottie/preview.html (aprobada por el usuario):
//   - exito: reproducir [0,104] y detener (la anim borra la palomita en frame 105+)
//   - error: recortar viewBox a "12 12 76 76" (quita el aire interno, sin difuminar)
//   - velocidades: escaneo 1.4, error 1.5
// ============================================================================
import { useEffect, useRef } from "react"
import lottie, { AnimationItem } from "lottie-web"

import escaneoData from "../assets/lottie/huella-escaneo.json"
import exitoData from "../assets/lottie/huella-exito.json"
import errorData from "../assets/lottie/huella-error.json"

export type EstadoHuella = "escaneo" | "exito" | "error"

const CFG: Record<EstadoHuella, {
  data: any
  loop: boolean
  speed?: number
  freezeAtFrame?: number
  zoomViewBox?: string
}> = {
  escaneo: { data: escaneoData, loop: true, speed: 1.4 },
  // Las 3 capas (palomita+círculo) terminan en op=105; después (105→120 global)
  // ya NO hay contenido visible. Congelamos en 105 (último frame con todo visible
  // y la palomita completa). Un poco más de tiempo que el 104 anterior, sin caer
  // en la zona vacía.
  exito: { data: exitoData, loop: false, freezeAtFrame: 105 },
  error: { data: errorData, loop: false, speed: 1.5, zoomViewBox: "12 12 76 76" },
}

interface Props {
  estado: EstadoHuella
  size?: number
}

export default function HuellaAnimacion({ estado, size = 160 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<AnimationItem | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const c = CFG[estado]

    // Destruir la animación previa antes de montar la nueva.
    if (animRef.current) { animRef.current.destroy(); animRef.current = null }

    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: c.loop,
      autoplay: true,
      animationData: c.data,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
    })

    if (c.speed) anim.setSpeed(c.speed)

    anim.addEventListener("DOMLoaded", () => {
      const svg = containerRef.current?.querySelector("svg")
      // error: recortar viewBox (vectorial → nítido, sin CSS scale)
      if (svg && c.zoomViewBox) {
        svg.setAttribute("viewBox", c.zoomViewBox)
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
      }
      // exito: reproducir hasta el frame donde la palomita está plena y detener
      if (c.freezeAtFrame != null) {
        anim.playSegments([0, c.freezeAtFrame], true)
      }
    })

    animRef.current = anim
    return () => { anim.destroy(); if (animRef.current === anim) animRef.current = null }
  }, [estado])

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className="mx-auto flex items-center justify-center"
      aria-hidden="true"
    />
  )
}
