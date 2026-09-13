import { useCallback, useRef, useState } from 'react';

import { AudioPlayer } from '../audio/AudioPlayer';
import { MicCapture } from '../audio/MicCapture';
import type { VoiceBackendConnector, VoiceEvent, VoiceState } from '../connectors/types';

export type CallStatus = 'idle' | 'connecting' | 'active' | 'error';

/** Quản lý 1 cuộc gọi voice, connector-agnostic — không biết/không quan tâm backend thật là
 * Ultron hay gì khác, chỉ gọi qua `VoiceBackendConnector`. Port từ
 * apps/web/src/features/voice/hooks/useVoiceSession.ts (Ultron) nhưng tách phần transport ra
 * ngoài (đó là lý do có interface connector). */
export function useVoiceCall(createConnector: () => VoiceBackendConnector) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [voiceState, setVoiceState] = useState<VoiceState>('listening');
  const [error, setError] = useState<string | null>(null);

  const connectorRef = useRef<VoiceBackendConnector | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const stop = useCallback(() => {
    connectorRef.current?.close();
    connectorRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    setStatus('idle');
    setVoiceState('listening');
  }, []);

  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'active') return;
    setError(null);
    setStatus('connecting');

    const connector = createConnector();
    connectorRef.current = connector;
    const player = new AudioPlayer();
    playerRef.current = player;
    const mic = new MicCapture();
    micRef.current = mic;

    const handleEvent = (event: VoiceEvent) => {
      switch (event.type) {
        case 'audio-delta':
          setVoiceState('speaking');
          player.playChunk(event.pcm);
          break;
        case 'state':
          setVoiceState(event.value);
          break;
        case 'interrupted':
          player.interrupt();
          setVoiceState('listening');
          break;
        case 'turn-complete':
          setVoiceState('listening');
          break;
        case 'error':
          setError(event.message);
          setStatus('error');
          stop();
          break;
      }
    };

    try {
      connector.on(handleEvent);
      await connector.connect();
      player.start(connector.outputSampleRate);
      await mic.start(connector.inputSampleRate, (pcm) => connector.sendAudioChunk(pcm));
      setStatus('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không bắt đầu được cuộc gọi.');
      setStatus('error');
      stop();
    }
  }, [createConnector, status, stop]);

  return { status, voiceState, error, start, stop };
}
