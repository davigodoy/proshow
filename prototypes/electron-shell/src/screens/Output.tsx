import type { CSSProperties } from 'react'
import type { LiveState } from '../projection'
import type { ProjectionTheme } from '../theme/types'
import { DEFAULT_THEME } from '../theme/presets'
import {
  effectiveSafeArea,
  outputMaskClipPath,
  type ThemeSafeArea,
} from '../theme/safeArea'
import type { SpectrumConfig } from '../spectrum'
import { LyricStage } from '../components/LyricStage'
import { DEFAULT_PLAYBACK, type MediaPlayback } from '../components/MediaPlayer'
import '../components/lyric-stage.css'
import './output.css'

type Props = {
  live: LiveState
  theme?: ProjectionTheme | null
  /** Limite externo da projeção; a margem do tema recorta dentro dele. */
  outputSafeArea?: ThemeSafeArea | null
  spectrum?: SpectrumConfig | null
}

function playbackFromLive(live: LiveState): MediaPlayback {
  return {
    playing: live.mediaPlaying !== false,
    muted: Boolean(live.mediaMuted),
    loop: live.mediaLoop !== false,
    volume: live.mediaVolume ?? 1,
    seekTo: live.mediaSeekTo ?? null,
    seekSeq: live.mediaSeekSeq ?? 0,
    voiceIsolate: Boolean(live.mediaVoiceIsolate),
  }
}

export function Output({ live, theme, outputSafeArea, spectrum = null }: Props) {
  const isMedia =
    live.kind === 'video' ||
    live.kind === 'audio' ||
    live.kind === 'web' ||
    live.mediaKind === 'video' ||
    live.mediaKind === 'audio'
  const activeTheme = theme || DEFAULT_THEME

  return (
    <div className="out">
      <div
        className="out-mask"
        style={
          {
            '--out-mask': outputMaskClipPath(outputSafeArea),
          } as CSSProperties
        }
      >
      <LyricStage
        title={live.title}
        artist={live.artist}
        lines={live.lines}
        phraseSlots={live.phraseSlots}
        slotThemes={live.slotThemes}
        artistic={Boolean(live.stackArtistic)}
        artisticPlan={live.artisticPlan}
        cameraDeviceId={live.cameraDeviceId}
        cameraAudio={live.kind === 'camera'}
        cameraVoiceIsolate={Boolean(
          live.kind === 'camera' && live.mediaVoiceIsolate,
        )}
        cameraForeground={live.kind === 'camera'}
        cameraCaption={
          live.kind === 'camera' ? live.cameraCaption : null
        }
        mediaPath={live.mediaPath}
        mediaKind={live.mediaKind}
        mediaFit={live.mediaFit || 'contain'}
        mediaSlidePaths={live.mediaSlidePaths}
        mediaScrollRatio={live.mediaScrollRatio ?? 0}
        mediaPlayback={isMedia ? playbackFromLive(live) : DEFAULT_PLAYBACK}
        mediaForceMuted={live.kind === 'camera' ? Boolean(live.mediaMuted) : false}
        showCamera
        theme={activeTheme}
        visible={live.visible}
        contentKind={live.kind || null}
        mirroredCamera={false}
        safeArea={effectiveSafeArea(activeTheme, outputSafeArea)}
        outputSafeArea={outputSafeArea}
        wrapLines={live.kind === 'bible' || Boolean(activeTheme.wrapLines)}
        spectrum={spectrum}
      />
      </div>
    </div>
  )
}
