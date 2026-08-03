import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ProjectionTheme } from '../theme/types'
import { themeToCssVars } from '../theme/types'
import { clampBlockIntoArea } from '../theme/layout'
import { ANIMATION_OPTIONS, FONT_OPTIONS } from '../theme/presets'
import { toMediaUrl } from '../mediaUrl'
import {
  themeSafeArea,
  normalizeThemeSafeArea,
  normalizeOutputSafeArea,
  composeSafeArea,
  type ThemeSafeArea,
} from '../theme/safeArea'
import { resolveSizeMode, toExplicitSizeFields } from '../theme/sizeMode'
import { FittedThemeCopy } from './FittedThemeCopy'
import './theme-editor.css'

export type ThemeEditTarget = 'title' | 'phrase'

type Props = {
  theme: ProjectionTheme
  onChange: (next: ProjectionTheme) => void
  extraFonts?: Array<{ id: string; label: string; value: string }>
  /** O que está selecionado no canvas — controla quais ajustes aparecem */
  editTarget: ThemeEditTarget
}

export function ThemeEditor({
  theme,
  onChange,
  extraFonts = [],
  editTarget,
}: Props) {
  const fontOptions = [...extraFonts, ...FONT_OPTIONS]

  function patch(partial: Partial<ProjectionTheme>) {
    onChange({ ...theme, ...partial })
  }

  const isTitle = editTarget === 'title'

  return (
    <div className="theme-editor theme-editor-controls-only">
      <div className="theme-editor-controls">
        <p className="theme-edit-target-hint">
          Ajustando: <strong>{isTitle ? 'Título' : 'Letra'}</strong>
          <span> — clique no canvas para trocar</span>
        </p>

        {isTitle ? (
          <>
            <label>
              Fonte
              <select
                value={theme.titleFontFamily || theme.fontFamily}
                onChange={(e) => patch({ titleFontFamily: e.target.value })}
              >
                {fontOptions.map((f) => (
                  <option key={f.id} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tamanho ({Number(theme.titleSizeVw || 1.5).toFixed(1)})
              <input
                type="range"
                min={0.5}
                max={12}
                step={0.1}
                value={Math.min(
                  12,
                  Math.max(0.5, Number(theme.titleSizeVw) || 1.5),
                )}
                onChange={(e) => patch({ titleSizeVw: Number(e.target.value) })}
              />
            </label>
            <label>
              Cor do título
              <input
                type="color"
                value={theme.titleColor || theme.lyricColor || '#ffffff'}
                onChange={(e) => patch({ titleColor: e.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Fonte
              <select
                value={theme.phraseFontFamily || theme.fontFamily}
                onChange={(e) =>
                  patch({
                    phraseFontFamily: e.target.value,
                    fontFamily: e.target.value,
                  })
                }
              >
                {fontOptions.map((f) => (
                  <option key={f.id} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <SizeModeGroup theme={theme} patch={patch} />
            <label>
              Cor da letra
              <input
                type="color"
                value={theme.lyricColor}
                onChange={(e) => patch({ lyricColor: e.target.value })}
              />
            </label>
          </>
        )}

        <label>
          Âncora vertical
          <select
            value={theme.vertical}
            onChange={(e) =>
              patch({
                vertical: e.target.value as ProjectionTheme['vertical'],
                offsetYPct: 0,
                titleOffsetYPct: 0,
              })
            }
          >
            <option value="top">Topo</option>
            <option value="center">Centro</option>
            <option value="bottom">Embaixo</option>
          </select>
        </label>

        <label>
          Alinhamento
          <select
            value={theme.textAlign}
            onChange={(e) =>
              patch({ textAlign: e.target.value as ProjectionTheme['textAlign'] })
            }
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </label>

        <div className="theme-rotate-row">
          <label>
            Rotação (
            {Math.round(
              isTitle
                ? Number(theme.titleRotationDeg) || 0
                : Number(theme.rotationDeg) || 0,
            )}
            °)
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.max(
                -180,
                Math.min(
                  180,
                  isTitle
                    ? Number(theme.titleRotationDeg) || 0
                    : Number(theme.rotationDeg) || 0,
                ),
              )}
              onChange={(e) =>
                patch(
                  isTitle
                    ? { titleRotationDeg: Number(e.target.value) }
                    : { rotationDeg: Number(e.target.value) },
                )
              }
            />
          </label>
          <button
            type="button"
            className="ghost theme-rotate-reset"
            title="Zerar rotação do elemento selecionado"
            onClick={() =>
              patch(isTitle ? { titleRotationDeg: 0 } : { rotationDeg: 0 })
            }
          >
            0°
          </button>
        </div>

        <label>
          Animação
          <select
            value={theme.animation || 'none'}
            onChange={(e) =>
              patch({ animation: e.target.value as ProjectionTheme['animation'] })
            }
          >
            {ANIMATION_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Duração ({theme.animationMs || 350}ms)
          <input
            type="range"
            min={100}
            max={1200}
            step={20}
            value={theme.animationMs || 350}
            onChange={(e) => patch({ animationMs: Number(e.target.value) })}
          />
        </label>

        <label title="Modo 1 linha: atraso da entrada após o início da saída. 0 = ambas juntas (sobrepostas).">
          Intervalo ({theme.animationIntervalMs ?? 0}ms)
          <input
            type="range"
            min={0}
            max={800}
            step={20}
            value={theme.animationIntervalMs ?? 0}
            onChange={(e) =>
              patch({ animationIntervalMs: Number(e.target.value) })
            }
          />
        </label>
      </div>
    </div>
  )
}

/** Fundo + visibilidade — fica abaixo do canvas */
export function ThemeStageExtras({
  theme,
  onChange,
}: {
  theme: ProjectionTheme
  onChange: (next: ProjectionTheme) => void
}) {
  function patch(partial: Partial<ProjectionTheme>) {
    onChange({ ...theme, ...partial })
  }

  async function pickBg(kind?: 'image' | 'video') {
    const result = await window.projection?.pickThemeBackground?.(kind)
    if (!result || result.canceled || !result.path) return
    if (result.kind === 'video') {
      patch({ backgroundVideo: result.path, backgroundImage: null })
    } else {
      patch({ backgroundImage: result.path, backgroundVideo: null })
    }
  }

  return (
    <div className="theme-stage-extras">
      <fieldset className="theme-show-fields">
        <legend>Fundo do tema</legend>
        <div className="theme-bg-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void pickBg('image')}
          >
            Imagem…
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void pickBg('video')}
          >
            Vídeo (loop)…
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!theme.backgroundImage && !theme.backgroundVideo}
            onClick={() =>
              patch({ backgroundImage: null, backgroundVideo: null })
            }
          >
            Limpar
          </button>
        </div>
        {theme.backgroundVideo ? (
          <p className="theme-bg-path" title={theme.backgroundVideo}>
            Vídeo: {fileName(theme.backgroundVideo)}
          </p>
        ) : theme.backgroundImage ? (
          <p className="theme-bg-path" title={theme.backgroundImage}>
            Imagem: {fileName(theme.backgroundImage)}
          </p>
        ) : (
          <p className="theme-bg-path muted">Só cor de fundo</p>
        )}
        <label>
          Cor de fundo (fallback)
          <input
            type="color"
            value={theme.backgroundColor || '#000000'}
            onChange={(e) => patch({ backgroundColor: e.target.value })}
          />
        </label>
      </fieldset>

      <fieldset className="theme-show-fields">
        <legend>Mostrar na projeção</legend>
        <label className="theme-check">
          <input
            type="checkbox"
            checked={theme.showTitle !== false}
            onChange={(e) => patch({ showTitle: e.target.checked })}
          />
          Título / referência
        </label>
        <label className="theme-check">
          <input
            type="checkbox"
            checked={Boolean(theme.showArtist)}
            onChange={(e) => patch({ showArtist: e.target.checked })}
          />
          Artista
        </label>
        <label className="theme-check">
          <input
            type="checkbox"
            checked={theme.showLyrics !== false}
            onChange={(e) => patch({ showLyrics: e.target.checked })}
          />
          Letra / versículo
        </label>
        <label className="theme-check">
          <input
            type="checkbox"
            checked={Boolean(theme.uppercase)}
            onChange={(e) => patch({ uppercase: e.target.checked })}
          />
          Tudo em MAIÚSCULAS
        </label>
        <div className="theme-check theme-bg-inline">
          <span>Mídia de Fundo</span>
          <button
            type="button"
            className="theme-bg-inline-btn"
            title="Adicionar imagem ou vídeo de fundo"
            aria-label="Adicionar imagem ou vídeo de fundo"
            onClick={() => void pickBg()}
          >
            +
          </button>
          <button
            type="button"
            className="theme-bg-inline-btn"
            title="Remover mídia de fundo"
            aria-label="Remover mídia de fundo"
            disabled={!theme.backgroundImage && !theme.backgroundVideo}
            onClick={() => patch({ backgroundImage: null, backgroundVideo: null })}
          >
            −
          </button>
        </div>
      </fieldset>
    </div>
  )
}

/** Última posição do slider de linhas significa "sem teto". */
const UNLIMITED_SLIDER = 10

/**
 * Tamanho da letra + PREENCHER + máximo de linhas, num bloco só.
 *
 * Ficam juntos porque são uma decisão só: o slider muda de significado
 * conforme o PREENCHER, e a quebra de linha decide o que acontece com o que
 * não couber. Espalhados pela tela, davam a impressão de serem independentes.
 *
 * Tema legado (sem `fillMode`) mostra o estado que ele já tem na prática; ao
 * tocar em qualquer controle daqui, ele vira explícito e passa a valer a
 * semântica nova — nenhum tema muda de comportamento sozinho.
 */
function SizeModeGroup({
  theme,
  patch,
}: {
  theme: ProjectionTheme
  patch: (partial: Partial<ProjectionTheme>) => void
}) {
  const mode = resolveSizeMode(theme)
  // Tema antigo sem `maxLines`: herda do booleano que já existia.
  const maxLines =
    theme.maxLines != null
      ? Number(theme.maxLines) || 0
      : theme.wrapLines === false
        ? 1
        : 0
  const isFill = mode.kind === 'fill' || (mode.kind === 'legacy' && mode.effectiveFill)
  const explicit = toExplicitSizeFields(theme)
  const isLegacy = mode.kind === 'legacy'

  const sliderValue = isFill ? explicit.fillPct : explicit.lyricSizeVw
  const sliderLabel = isFill
    ? `${Math.round(explicit.fillPct)}% da área`
    : `${explicit.lyricSizeVw.toFixed(1)} vw`

  return (
    <div className="theme-size-group">
      <span className="theme-size-group-title">Tamanho da letra</span>

      <label className="theme-check">
        <input
          type="checkbox"
          checked={isFill}
          onChange={(e) =>
            patch({ ...explicit, fillMode: e.target.checked })
          }
        />
        Preencher
      </label>

      <label>
        {maxLines === 0
          ? 'Linhas: ilimitado'
          : `Máximo de ${maxLines} linha${maxLines === 1 ? '' : 's'}`}
        <input
          type="range"
          min={1}
          max={UNLIMITED_SLIDER}
          step={1}
          value={maxLines === 0 ? UNLIMITED_SLIDER : maxLines}
          onChange={(e) => {
            const v = Number(e.target.value)
            const next = v >= UNLIMITED_SLIDER ? 0 : v
            // `wrapLines` continua alimentando o render e a saída, que já o
            // leem; aqui ele passa a ser consequência do teto de linhas.
            patch({ maxLines: next, wrapLines: next !== 1 })
          }}
        />
      </label>

      <label>
        {sliderLabel}
        <input
          type="range"
          min={isFill ? 2 : 0.4}
          max={isFill ? 100 : 20}
          step={isFill ? 1 : 0.1}
          value={sliderValue}
          onChange={(e) => {
            const v = Number(e.target.value)
            patch(
              isFill
                ? { ...explicit, fillMode: true, fillPct: v }
                : { ...explicit, fillMode: false, lyricSizeVw: v },
            )
          }}
        />
      </label>

      <p className="theme-size-hint">
        {isFill
          ? 'A letra cresce até ocupar essa parte da área do tema.'
          : 'A letra fica nesse tamanho. O que não couber vira slide novo.'}
        {isLegacy ? ' Tema antigo — mexer aqui atualiza para o modo novo.' : ''}
      </p>
    </div>
  )
}

function fileName(p: string) {
  return p.split(/[/\\]/).pop() || p
}

export type ThemeCanvasMode = 'move' | 'rotate'

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function snapAngle(deg: number, step = 15, threshold = 4): number {
  const nearest = Math.round(deg / step) * step
  return Math.abs(deg - nearest) <= threshold ? nearest : deg
}

function pointerAngleDeg(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI
}

/** Overlay de arraste / rotação sobre o canvas (estilo Canva) — pivô sempre no centro */
export function ThemeCanvasDrag({
  theme,
  onChange,
  mode = 'move',
}: {
  theme: ProjectionTheme
  onChange: (next: ProjectionTheme) => void
  mode?: ThemeCanvasMode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const rotStart = useRef({ pointer: 0, rotation: 0 })
  const [active, setActive] = useState(false)
  const [hudAngle, setHudAngle] = useState<number | null>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return

      if (mode === 'rotate') {
        const ang = pointerAngleDeg(e.clientX, e.clientY, rect)
        let next = rotStart.current.rotation + (ang - rotStart.current.pointer)
        // normaliza −180…180
        next = ((next + 180) % 360 + 360) % 360 - 180
        next = snapAngle(next)
        next = Math.round(next)
        setHudAngle(next)
        onChange({ ...theme, rotationDeg: next })
        return
      }

      const x = ((e.clientX - rect.left) / rect.width) * 100 - 50
      const y = ((e.clientY - rect.top) / rect.height) * 100 - 50
      onChange({
        ...theme,
        offsetXPct: clamp(Math.round(x), -40, 40),
        offsetYPct: clamp(Math.round(y), -40, 40),
        vertical: 'center',
      })
    }
    const onUp = () => {
      dragging.current = false
      setActive(false)
      setHudAngle(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [theme, onChange, mode])

  const rot = Number(theme.rotationDeg) || 0

  function beginDrag(e: ReactPointerEvent) {
    e.preventDefault()
    if (!ref.current) return
    dragging.current = true
    setActive(true)
    if (mode === 'rotate') {
      const rect = ref.current.getBoundingClientRect()
      rotStart.current = {
        pointer: pointerAngleDeg(e.clientX, e.clientY, rect),
        rotation: rot,
      }
      setHudAngle(Math.round(rot))
    }
  }

  return (
    <div
      ref={ref}
      className={`theme-canvas-drag mode-${mode} ${active ? 'is-active' : ''}`.trim()}
      onPointerDown={beginDrag}
      title={
        mode === 'rotate'
          ? 'Arraste para girar (sempre pelo centro)'
          : 'Arraste para posicionar'
      }
    >
      <div className="theme-canvas-guides" aria-hidden>
        <span className="guide-line guide-h guide-center" />
        <span className="guide-line guide-v guide-center" />
        <span className="guide-line guide-h guide-third-a" />
        <span className="guide-line guide-h guide-third-b" />
        <span className="guide-line guide-v guide-third-a" />
        <span className="guide-line guide-v guide-third-b" />
        {mode === 'rotate' ? (
          <>
            <span className="guide-rotate-ring" />
            <span
              className="guide-rotate-arm"
              style={{
                transform: `rotate(${active && hudAngle != null ? hudAngle : rot}deg)`,
              }}
            />
            <span className="guide-rotate-snap guide-snap-0" />
            <span className="guide-rotate-snap guide-snap-45" />
            <span className="guide-rotate-snap guide-snap-90" />
            <span className="guide-rotate-snap guide-snap-135" />
          </>
        ) : null}
      </div>
      {mode === 'rotate' && (active || Math.abs(rot) > 0.01) ? (
        <div className="theme-canvas-angle-hud">
          {Math.round(active && hudAngle != null ? hudAngle : rot)}°
        </div>
      ) : null}
    </div>
  )
}

const STUDIO_TITLE = 'Grande é o Senhor'
const STUDIO_LINE = 'Digno de louvor'

type SafeEdge = 'n' | 's' | 'e' | 'w'

/**
 * Preview do estúdio: título livre no stage; letra na área de texto (largura total).
 * Drag sempre move; rotação só pelo slider nos ajustes.
 * Área de texto = theme.safeArea, medida DENTRO da área liberada pela saída.
 * Os handles nunca passam da margem da saída — ela é o limite externo único.
 */
export function ThemeStudioPreview({
  theme,
  onChange,
  editTarget,
  onSelectTarget,
  outputSafeArea,
}: {
  theme: ProjectionTheme
  onChange: (next: ProjectionTheme) => void
  editTarget: ThemeEditTarget
  onSelectTarget: (next: ThemeEditTarget) => void
  outputSafeArea?: ThemeSafeArea | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const safeBoxRef = useRef<HTMLDivElement>(null)
  const phraseAreaRef = useRef<HTMLDivElement | null>(null)
  const titleElRef = useRef<HTMLDivElement | null>(null)
  const phraseElRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const dragTarget = useRef<ThemeEditTarget>('phrase')
  const themeRef = useRef(theme)
  themeRef.current = theme
  /** Margem do tema, relativa à área da saída — é o que o tema guarda. */
  const safeArea = themeSafeArea(theme)
  const safeRef = useRef(safeArea)
  safeRef.current = safeArea
  const outArea = normalizeOutputSafeArea(outputSafeArea)
  const outRef = useRef(outArea)
  outRef.current = outArea
  /** Mesma área que a saída desenha — preview e projeção têm de concordar. */
  const composedArea = composeSafeArea(outArea, safeArea)
  const [active, setActive] = useState(false)
  const [marginDrag, setMarginDrag] = useState<SafeEdge | null>(null)

  const bgImage = toMediaUrl(theme.backgroundImage)
  const bgVideo = toMediaUrl(theme.backgroundVideo)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !rootRef.current) return
      const stage = rootRef.current.getBoundingClientRect()
      if (stage.width < 1 || stage.height < 1) return
      const cur = themeRef.current
      const target = dragTarget.current

      // O arrasto grava a posição ABSOLUTA na caixa de referência do bloco:
      // 0 = centro, ±50 = borda. Nada é somado nem subtraído por trás, então
      // o que o editor mostra é o que o tema guarda e o que a saída projeta.
      if (target === 'title') {
        // Referência do título: a área da saída (aqui, o quadro do estúdio).
        const x = ((e.clientX - stage.left) / stage.width) * 100 - 50
        const y = ((e.clientY - stage.top) / stage.height) * 100 - 50
        onChange({
          ...cur,
          titleOffsetXPct: clamp(Math.round(x), -50, 50),
          titleOffsetYPct: clamp(Math.round(y), -50, 50),
        })
      } else {
        // Referência da letra: a caixa de texto do tema.
        const box =
          phraseAreaRef.current?.getBoundingClientRect() ||
          safeBoxRef.current?.getBoundingClientRect() ||
          stage
        const y = ((e.clientY - box.top) / box.height) * 100 - 50
        onChange({
          ...cur,
          offsetXPct: 0,
          offsetYPct: clamp(Math.round(y), -50, 50),
        })
      }

      requestAnimationFrame(() => {
        const stageEl = rootRef.current
        const areaEl = phraseAreaRef.current || safeBoxRef.current
        if (!stageEl || !areaEl) return

        // Arrastar um bloco NUNCA move o outro. O afastamento automático
        // reescrevia o offset do bloco parado a cada quadro do arrasto, então
        // a posição definida no tema não sobrevivia a um ajuste vizinho.
        // Quem decide onde cada bloco fica é o operador.

        requestAnimationFrame(() => {
          const stage2 = rootRef.current
          const area2 = phraseAreaRef.current || safeBoxRef.current
          if (!stage2 || !area2) return
          if (target === 'title') {
            const t = titleElRef.current
            if (!t) return
            const text = t.querySelector<HTMLElement>('.fitted-theme-title')
            const contained = clampBlockIntoArea({
              theme: themeRef.current,
              dragged: 'title',
              el: t,
              area: stage2,
              textEl: text,
              padPx: 6,
            })
            if (contained) onChange({ ...themeRef.current, ...contained })
          } else {
            const p = phraseElRef.current
            if (!p) return
            const contained = clampBlockIntoArea({
              theme: themeRef.current,
              dragged: 'phrase',
              el: p,
              area: area2,
              padPx: 4,
            })
            if (contained) onChange({ ...themeRef.current, ...contained })
          }
        })
      })
    }

    const onUp = () => {
      if (dragging.current) {
        const target = dragTarget.current
        const stageEl = rootRef.current
        const areaEl = phraseAreaRef.current || safeBoxRef.current
        if (target === 'title' && stageEl && titleElRef.current) {
          const t = titleElRef.current
          const text = t.querySelector<HTMLElement>('.fitted-theme-title')
          const contained = clampBlockIntoArea({
            theme: themeRef.current,
            dragged: 'title',
            el: t,
            area: stageEl,
            textEl: text,
            padPx: 6,
          })
          if (contained) onChange({ ...themeRef.current, ...contained })
        } else if (target === 'phrase' && areaEl && phraseElRef.current) {
          const contained = clampBlockIntoArea({
            theme: themeRef.current,
            dragged: 'phrase',
            el: phraseElRef.current,
            area: areaEl,
            padPx: 4,
          })
          if (contained) onChange({ ...themeRef.current, ...contained })
        }

      }
      dragging.current = false
      setActive(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onChange])

  const startMarginDrag = useCallback(
    (edge: SafeEdge, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      setMarginDrag(edge)
      let latest = safeRef.current

      const onMove = (ev: PointerEvent) => {
        const cur = safeRef.current
        const out = outRef.current
        // O ponteiro fala em % do quadro; o tema guarda % da área da saída.
        // Converter aqui é o que impede o handle de escapar da margem mestre.
        const freeW = Math.max(1e-6, 100 - out.left - out.right)
        const freeH = Math.max(1e-6, 100 - out.top - out.bottom)
        const x = (((ev.clientX - rect.left) / rect.width) * 100 - out.left) * 100 / freeW
        const y = (((ev.clientY - rect.top) / rect.height) * 100 - out.top) * 100 / freeH
        latest = normalizeThemeSafeArea({
          ...cur,
          top: edge === 'n' ? y : cur.top,
          bottom: edge === 's' ? 100 - y : cur.bottom,
          left: edge === 'w' ? x : cur.left,
          right: edge === 'e' ? 100 - x : cur.right,
        })
        onChange({ ...themeRef.current, safeArea: latest })
      }
      const onUp = () => {
        setMarginDrag(null)
        onChange({ ...themeRef.current, safeArea: latest })
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onChange],
  )

  function beginInteract(
    e: ReactPointerEvent,
    target?: ThemeEditTarget,
  ) {
    e.preventDefault()
    e.stopPropagation()
    if (target) {
      onSelectTarget(target)
      dragTarget.current = target
    }
    if (!rootRef.current) return
    dragging.current = true
    setActive(true)
  }

  const stageStyle = {
    ...themeToCssVars(theme, 'container'),
    backgroundColor: theme.backgroundColor || '#000',
    '--safe-top': `${composedArea.top}%`,
    '--safe-right': `${composedArea.right}%`,
    '--safe-bottom': `${composedArea.bottom}%`,
    '--safe-left': `${composedArea.left}%`,
    '--out-top': `${outArea.top}%`,
    '--out-right': `${outArea.right}%`,
    '--out-bottom': `${outArea.bottom}%`,
    '--out-left': `${outArea.left}%`,
  } as CSSProperties

  const showOutBounds =
    outArea.top > 0 || outArea.right > 0 || outArea.bottom > 0 || outArea.left > 0

  return (
    <div
      ref={rootRef}
      className={`theme-studio-preview mode-move${active ? ' is-active' : ''}${
        marginDrag ? ' is-margin-drag' : ''
      }`}
      style={stageStyle}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) beginInteract(e, editTarget)
      }}
    >
      {bgVideo ? (
        <video
          className="theme-studio-bg"
          src={bgVideo}
          autoPlay
          muted
          loop
          playsInline
          draggable={false}
        />
      ) : bgImage ? (
        <img className="theme-studio-bg" src={bgImage} alt="" draggable={false} />
      ) : null}

      <FittedThemeCopy
        theme={theme}
        title={theme.showTitle !== false ? STUDIO_TITLE : ''}
        lines={theme.showLyrics !== false ? [STUDIO_LINE] : []}
        contained
        wrapLines={Boolean(theme.wrapLines)}
        safeInsets={composedArea}
        titleSelected={editTarget === 'title'}
        phraseSelected={editTarget === 'phrase'}
        onTitlePointerDown={(e) => beginInteract(e, 'title')}
        onPhrasePointerDown={(e) => beginInteract(e, 'phrase')}
        titleRef={(el) => {
          titleElRef.current = el
        }}
        phraseRef={(el) => {
          phraseElRef.current = el
        }}
        phraseAreaRef={(el) => {
          phraseAreaRef.current = el
        }}
        titleTag={<span className="theme-studio-zone-tag">Título</span>}
        phraseTag={<span className="theme-studio-zone-tag">Letra</span>}
      />

      {showOutBounds ? (
        <div className="theme-studio-out-bounds" aria-hidden>
          <span className="theme-studio-out-label">Margem da saída</span>
        </div>
      ) : null}

      <div
        ref={safeBoxRef}
        className={`theme-studio-safe${marginDrag ? ' is-dragging' : ''}`}
      >
        <span className="theme-studio-safe-label">Área do texto</span>
        <>
          <button
            type="button"
            className="theme-studio-safe-handle n"
            aria-label="Margem superior"
            onPointerDown={(e) => startMarginDrag('n', e)}
          />
          <button
            type="button"
            className="theme-studio-safe-handle s"
            aria-label="Margem inferior"
            onPointerDown={(e) => startMarginDrag('s', e)}
          />
          <button
            type="button"
            className="theme-studio-safe-handle e"
            aria-label="Margem direita"
            onPointerDown={(e) => startMarginDrag('e', e)}
          />
          <button
            type="button"
            className="theme-studio-safe-handle w"
            aria-label="Margem esquerda"
            onPointerDown={(e) => startMarginDrag('w', e)}
          />
        </>
      </div>

      <div className="theme-canvas-guides" aria-hidden>
        <span className="guide-line guide-h guide-center" />
        <span className="guide-line guide-v guide-center" />
        <span className="guide-line guide-h guide-third-a" />
        <span className="guide-line guide-h guide-third-b" />
        <span className="guide-line guide-v guide-third-a" />
        <span className="guide-line guide-v guide-third-b" />
      </div>
      <div className="theme-studio-safe-readout" aria-hidden>
        <span>↑{safeArea.top.toFixed(0)}%</span>
        <span>→{safeArea.right.toFixed(0)}%</span>
        <span>↓{safeArea.bottom.toFixed(0)}%</span>
        <span>←{safeArea.left.toFixed(0)}%</span>
      </div>
    </div>
  )
}
