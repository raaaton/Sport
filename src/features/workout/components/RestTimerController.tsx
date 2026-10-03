import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getDatabase } from '@/shared/database';
import { notificationHaptic } from '@/shared/haptics';
import type { RestTimer } from '../domain/models';
import { transitionPersistedRestTimer } from '../data/restTimerRepository';
import { RestTimerPanel } from './RestTimerPanel';

type Props = {
  timer: RestTimer;
  nextSetNumber: number;
  actionBusy?: boolean;
  onTimerChange: (timer: RestTimer | null) => void;
  onAction: (action: 'pause' | 'resume' | 'skip') => void;
};

export function RestTimerController({ timer, nextSetNumber, actionBusy = false, onTimerChange, onAction }: Props) {
  const player = useAudioPlayer(require('../../../../assets/audio/rest-complete.wav'));
  const playerStatus = useAudioPlayerStatus(player);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const syncing = useRef(false);
  const restoreAudioMode = useRef(false);

  useEffect(() => {
    if (restoreAudioMode.current && !playerStatus.playing) {
      restoreAudioMode.current = false;
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    }
  }, [playerStatus.playing]);

  const resolveExpiry = useCallback(async () => {
    if (syncing.current || timer.state !== 'running' || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
    syncing.current = true;
    try {
      const { timer: updated, finishedNow } = await transitionPersistedRestTimer(await getDatabase(), timer.id, 'tick');
      if (updated && updated.state !== timer.state) onTimerChange(updated);
      if (finishedNow) {
        void notificationHaptic().catch(() => undefined);
        try {
          await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
          await player.seekTo(0);
          restoreAudioMode.current = true;
          player.play();
        } catch {
          restoreAudioMode.current = false;
          void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
          // Audio is optional; the durable timer transition and haptic remain authoritative.
        }
      }
    } catch {
      // Keep displaying from the persisted deadline and retry on the next refresh.
    } finally {
      syncing.current = false;
    }
  }, [onTimerChange, player, timer.id, timer.state]);

  useEffect(() => {
    if (timer.state !== 'running') return undefined;
    const updateDisplay = () => {
      setNowMs(Date.now());
      void resolveExpiry();
    };
    updateDisplay();
    let interval: ReturnType<typeof setInterval> | undefined = setInterval(updateDisplay, 1000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        updateDisplay();
        if (!interval) interval = setInterval(updateDisplay, 1000);
      } else if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    });
    return () => { if (interval) clearInterval(interval); appState.remove(); };
  }, [resolveExpiry, timer.state]);

  if (!['ready', 'running', 'paused'].includes(timer.state)) return null;
  return <RestTimerPanel timer={timer} nowMs={nowMs} nextSetNumber={nextSetNumber} actionBusy={actionBusy} onAction={onAction} />;
}
