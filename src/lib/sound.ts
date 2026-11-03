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

  /** Emite un pitido rápido de caja registradora / escáner de alta fidelidad */
  beep(freq = 1100, duration = 0.07) {
    if (!this.isEnabled()) return
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, ctx.currentTime + duration)

      gain.gain.setValueAtTime(0.09, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch {
      // AudioContext bloqueado por navegador hasta interacción
    }
  }

  /** Melodía corta de venta completada con éxito */
  success() {
    if (!this.isEnabled()) return
    this.beep(880, 0.08)
    setTimeout(() => this.beep(1320, 0.1), 70)
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
