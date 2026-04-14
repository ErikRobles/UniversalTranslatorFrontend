import { useCallback, useRef, useState } from 'react'

export function useMicrophoneCapture() {
  const [isRecording, setIsRecording] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const samplesRef = useRef<Float32Array[]>([])
  const isStartingRef = useRef(false)

  const startRecording = useCallback(async () => {
    if (isStartingRef.current || audioContextRef.current !== null || processorRef.current !== null) {
      throw new Error('recording_already_in_progress')
    }

    // Diagnostic logging for capability detection
    console.log('Microphone Capability Check:', {
      isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
      hasMediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
      hasGetUserMedia: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    })

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      console.error('Microphone capture failed: Browser capabilities missing. Note: mediaDevices requires HTTPS or localhost.')
      throw new Error('microphone_api_not_available')
    }

    isStartingRef.current = true
    samplesRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      // Request 16kHz to match typical ASR expectations and backend contract
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // Ensure context is running (especially important for Chrome/Safari)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      console.log(`[Audio] Context initialized. Actual sample rate: ${audioContext.sampleRate}Hz`)
      
      const source = audioContext.createMediaStreamSource(stream)
      // ScriptProcessorNode used as minimal bridge for sample access
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      samplesRef.current = []

      processor.onaudioprocess = (e: any) => {
        const inputData = e.inputBuffer.getChannelData(0)
        // Capture raw Float32 samples. Using a copy to avoid buffer reuse issues.
        samplesRef.current.push(new Float32Array(inputData))
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
      
      setIsRecording(true)
    } catch (err) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
      }
      processorRef.current?.disconnect()
      audioContextRef.current?.close().catch(console.error)
      streamRef.current = null
      processorRef.current = null
      audioContextRef.current = null
      samplesRef.current = []
      console.error('Failed to start PCM recording:', err)
      throw err
    } finally {
      isStartingRef.current = false
    }
  }, [])

  const stopRecording = useCallback((): Promise<{ buffer: ArrayBuffer; sampleRate: number }> => {
    return new Promise((resolve, reject) => {
      if (!audioContextRef.current || !processorRef.current) {
        reject(new Error('No recording in progress'))
        return
      }

      const audioContext = audioContextRef.current
      const processor = processorRef.current
      const stream = streamRef.current
      const actualSampleRate = audioContext.sampleRate
      const allChunks = samplesRef.current

      // Cleanup tracks and nodes
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      processor.onaudioprocess = null
      processor.disconnect()
      processorRef.current = null
      streamRef.current = null
      audioContextRef.current = null
      isStartingRef.current = false
      samplesRef.current = []
      
      // We don't close the context immediately if we want to reuse it, 
      // but here we follow the existing pattern of creating a new one each time.
      audioContext.close().catch(console.error)
      
      let totalSamples = 0
      for (const chunk of allChunks) {
        totalSamples += chunk.length
      }

      console.log(`[Audio] Recording stopped. Total samples: ${totalSamples} at ${actualSampleRate}Hz`)
      
      // Convert Float32 samples to Signed 16-bit PCM Little-Endian
      const buffer = new ArrayBuffer(totalSamples * 2)
      const view = new DataView(buffer)
      let offset = 0
      
      for (const chunk of allChunks) {
        for (let i = 0; i < chunk.length; i++) {
          const sample = chunk[i]
          // Clamp to [-1, 1] then scale to Int16
          const s = Math.max(-1, Math.min(1, sample))
          // Using Math.round to avoid truncation artifacts
          const pcm = Math.round(s < 0 ? s * 0x8000 : s * 0x7FFF)
          view.setInt16(offset, pcm, true) // true = little-endian
          offset += 2
        }
      }

      setIsRecording(false)
      resolve({ 
        buffer, 
        sampleRate: actualSampleRate 
      })
    })
  }, [])

  return {
    isRecording,
    startRecording,
    stopRecording,
  }
}
