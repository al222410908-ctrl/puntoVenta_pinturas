class SoundPlayer {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  /**
   * Emite un 'beep' sintetizado de 1200Hz para escaneos y agregados ultra-rápidos
   */
  scanBeep(freq = 1200, duration = 0.055) {
    if (!this.isEnabled()) return
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)

      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch {
      // AudioContext bloqueado por navegador hasta interacción de usuario
    }
  }

  /**
   * Sonido trifónico armónico al completar la venta (acorde ascendente D5 -> A5 -> D6)
   */
  triphonicSaleSuccess() {
    if (!this.isEnabled()) return
    try {
      const ctx = this.getContext()
      if (!ctx) return

      // Frecuencias trifónicas armónicas: D5 (587.33Hz), A5 (880.00Hz), D6 (1174.66Hz)
      const notes = [
        { freq: 587.33, delay: 0.0, dur: 0.16, vol: 0.11 },
        { freq: 880.0, delay: 0.07, dur: 0.22, vol: 0.12 },
        { freq: 1174.66, delay: 0.15, dur: 0.38, vol: 0.14 },
      ]

      const now = ctx.currentTime
      notes.forEach(({ freq, delay, dur, vol }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, now + delay)

        gain.gain.setValueAtTime(0.001, now + delay)
        gain.gain.linearRampToValueAtTime(vol, now + delay + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now + delay)
        osc.stop(now + delay + dur)
      })
    } catch {
      // Fallback
    }
  }

  /** Emite un pitido rápido de caja registradora / escáner de alta fidelidad */
  beep(freq = 1200, duration = 0.055) {
    this.scanBeep(freq, duration)
  }

  /** Melodía armónica de venta completada con éxito */
  success() {
    this.triphonicSaleSuccess()
  }

  isEnabled(): boolean {
    return localStorage.getItem('pos_sound_enabled') !== 'false'
  }

  setEnabled(enabled: boolean) {
    localStorage.setItem('pos_sound_enabled', enabled ? 'true' : 'false')
  }

  toggle(): boolean {
    const next = !this.isEnabled()
    this.setEnabled(next)
    return next
  }
}

export const sound = new SoundPlayer()
