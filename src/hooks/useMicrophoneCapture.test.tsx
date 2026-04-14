import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMicrophoneCapture } from './useMicrophoneCapture'

type FakeTrack = { stop: ReturnType<typeof vi.fn> }
type FakeStream = MediaStream & { _track: FakeTrack }
type FakeProcessor = {
  onaudioprocess: ((event: any) => void) | null
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

type FakeAudioContextInstance = {
  sampleRate: number
  state: string
  destination: object
  createMediaStreamSource: ReturnType<typeof vi.fn>
  createScriptProcessor: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function createStream(): FakeStream {
  const track = { stop: vi.fn() }
  return {
    _track: track,
    getTracks: () => [track],
  } as unknown as FakeStream
}

function installMicrophoneHarness(options: { failSourceConnect?: boolean } = {}) {
  const streams: FakeStream[] = []
  const processors: FakeProcessor[] = []
  const contexts: FakeAudioContextInstance[] = []

  const getUserMedia = vi.fn(async () => {
    const stream = createStream()
    streams.push(stream)
    return stream
  })

  class FakeAudioContext {
    sampleRate = 16000
    state = 'running'
    destination = {}
    createMediaStreamSource = vi.fn(() => ({
      connect: vi.fn(() => {
        if (options.failSourceConnect) {
          throw new Error('source_connect_failed')
        }
      }),
    }))
    createScriptProcessor = vi.fn(() => {
      const processor: FakeProcessor = {
        onaudioprocess: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      processors.push(processor)
      return processor
    })
    resume = vi.fn(() => Promise.resolve())
    close = vi.fn(() => Promise.resolve())

    constructor() {
      contexts.push(this)
    }
  }

  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  vi.stubGlobal('AudioContext', FakeAudioContext)

  return { getUserMedia, streams, processors, contexts }
}

describe('useMicrophoneCapture', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects overlapping start attempts before getUserMedia resolves', async () => {
    let resolveStream: (stream: MediaStream) => void = () => undefined
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve
        }),
    )
    const stop = vi.fn()
    const processors: FakeProcessor[] = []
    const source = { connect: vi.fn() }

    class FakeAudioContext {
      sampleRate = 16000
      state = 'running'
      destination = {}
      createMediaStreamSource = vi.fn(() => source)
      createScriptProcessor = vi.fn(() => {
        const processor: FakeProcessor = {
          onaudioprocess: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        processors.push(processor)
        return processor
      })
      resume = vi.fn(() => Promise.resolve())
      close = vi.fn(() => Promise.resolve())
    }

    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const { result } = renderHook(() => useMicrophoneCapture())

    const firstStart = result.current.startRecording()
    await expect(result.current.startRecording()).rejects.toThrow('recording_already_in_progress')

    await act(async () => {
      resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream)
      await firstStart
    })

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(processors).toHaveLength(1)
  })

  it('allows a fresh start after getUserMedia rejects during startup', async () => {
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new Error('permission_denied'))
      .mockImplementation(async () => createStream())
    const processors: FakeProcessor[] = []

    class FakeAudioContext {
      sampleRate = 16000
      state = 'running'
      destination = {}
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
      createScriptProcessor = vi.fn(() => {
        const processor: FakeProcessor = {
          onaudioprocess: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        processors.push(processor)
        return processor
      })
      resume = vi.fn(() => Promise.resolve())
      close = vi.fn(() => Promise.resolve())
    }

    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const { result } = renderHook(() => useMicrophoneCapture())

    await expect(result.current.startRecording()).rejects.toThrow('permission_denied')

    await act(async () => {
      await result.current.startRecording()
    })

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(processors).toHaveLength(1)
  })

  it('cleans up mid-init startup failure and allows a later fresh start', async () => {
    const failingHarness = installMicrophoneHarness({ failSourceConnect: true })
    const { result } = renderHook(() => useMicrophoneCapture())

    await expect(result.current.startRecording()).rejects.toThrow('source_connect_failed')

    expect(failingHarness.getUserMedia).toHaveBeenCalledTimes(1)
    expect(failingHarness.processors).toHaveLength(1)
    expect(failingHarness.processors[0].disconnect).toHaveBeenCalledTimes(1)
    expect(failingHarness.processors[0].onaudioprocess).toBeNull()
    expect(failingHarness.streams[0]._track.stop).toHaveBeenCalledTimes(1)
    expect(failingHarness.contexts[0].close).toHaveBeenCalledTimes(1)

    const successfulHarness = installMicrophoneHarness()

    await act(async () => {
      await result.current.startRecording()
    })

    expect(successfulHarness.getUserMedia).toHaveBeenCalledTimes(1)
    expect(successfulHarness.processors).toHaveLength(1)
  })

  it('stopRecording tears down active capture and permits a clean restart', async () => {
    const harness = installMicrophoneHarness()
    const { result } = renderHook(() => useMicrophoneCapture())

    await act(async () => {
      await result.current.startRecording()
    })

    const firstProcessor = harness.processors[0]
    expect(firstProcessor.onaudioprocess).toEqual(expect.any(Function))

    firstProcessor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0.25, -0.25]) },
    })

    let stopped: { buffer: ArrayBuffer; sampleRate: number } | undefined
    await act(async () => {
      stopped = await result.current.stopRecording()
    })

    expect(stopped?.sampleRate).toBe(16000)
    expect(stopped?.buffer.byteLength).toBe(4)
    expect(firstProcessor.onaudioprocess).toBeNull()
    expect(firstProcessor.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.streams[0]._track.stop).toHaveBeenCalledTimes(1)
    expect(harness.contexts[0].close).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.startRecording()
    })

    expect(harness.getUserMedia).toHaveBeenCalledTimes(2)
    expect(harness.processors).toHaveLength(2)
    expect(harness.processors[1]).not.toBe(firstProcessor)
  })

  it('rejects repeated manual starts without creating multiple active processors', async () => {
    const harness = installMicrophoneHarness()
    const { result } = renderHook(() => useMicrophoneCapture())

    await act(async () => {
      await result.current.startRecording()
    })

    await expect(result.current.startRecording()).rejects.toThrow('recording_already_in_progress')

    expect(harness.getUserMedia).toHaveBeenCalledTimes(1)
    expect(harness.processors).toHaveLength(1)
    expect(harness.processors[0].disconnect).not.toHaveBeenCalled()
  })

  it('keeps rapid start/stop/start sequences clean', async () => {
    const harness = installMicrophoneHarness()
    const { result } = renderHook(() => useMicrophoneCapture())

    await act(async () => {
      await result.current.startRecording()
    })

    const firstProcessor = harness.processors[0]

    await act(async () => {
      await result.current.stopRecording()
    })

    expect(firstProcessor.onaudioprocess).toBeNull()
    expect(firstProcessor.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.streams[0]._track.stop).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.startRecording()
    })

    expect(harness.getUserMedia).toHaveBeenCalledTimes(2)
    expect(harness.processors).toHaveLength(2)
    expect(harness.processors[1].onaudioprocess).toEqual(expect.any(Function))
    expect(harness.streams[1]._track.stop).not.toHaveBeenCalled()
  })
})
