import assert from 'node:assert/strict'
import test from 'node:test'
import { audioPresentationTheme, themeHasBackgroundArt } from '../src/theme/audioTheme.ts'
import type { ProjectionTheme } from '../src/projection'

const base: ProjectionTheme = {
  id: 'classic',
  name: 'Clássico',
  fontFamily: 'sans-serif',
  lyricSizeVw: 5,
  titleSizeVw: 1.5,
  lyricColor: '#fff',
  titleColor: '#fff',
  titleOpacity: 0.5,
  fontWeight: 600,
  letterSpacingEm: 0,
  lineHeight: 1.2,
  textAlign: 'center',
  vertical: 'center',
  offsetXPct: 0,
  offsetYPct: 0,
  rotationDeg: 0,
  padXVw: 6,
  padYVh: 6,
  textShadow: '',
  overlayGradient: '',
  backgroundColor: '#000',
  showTitle: true,
  showArtist: false,
  showLyrics: true,
  animation: 'fade',
  animationMs: 300,
  animationIntervalMs: 0,
  backgroundImage: null,
  backgroundVideo: null,
}

const withArt: ProjectionTheme = {
  ...base,
  id: 'mp3-test-bg',
  name: 'MP3 Teste Fundo',
  backgroundImage: '/tmp/fake-theme-bg.jpg',
  backgroundVideo: null,
  showTitle: true,
  showLyrics: true,
}

test('audioPresentationTheme uses named theme background image', () => {
  const t = audioPresentationTheme(
    { themeId: 'mp3-test-bg' },
    base,
    [base, withArt],
  )
  assert.equal(t.backgroundImage, '/tmp/fake-theme-bg.jpg')
  assert.equal(t.showTitle, false)
  assert.equal(t.showLyrics, false)
  assert.ok(themeHasBackgroundArt(t))
})

test('audioPresentationTheme prefers explicit bg media over theme art', () => {
  const t = audioPresentationTheme(
    {
      themeId: 'mp3-test-bg',
      bgMediaPath: '/tmp/override.png',
      bgMediaKind: 'image',
    },
    base,
    [base, withArt],
  )
  assert.equal(t.backgroundImage, '/tmp/override.png')
  assert.equal(t.backgroundVideo, null)
})

test('audioPresentationTheme keeps global theme art when themeId is empty', () => {
  const globalWithArt = {
    ...base,
    backgroundImage: '/tmp/global.jpg',
  }
  const t = audioPresentationTheme({ themeId: null }, globalWithArt, [
    globalWithArt,
  ])
  assert.equal(t.backgroundImage, '/tmp/global.jpg')
})

test('audioPresentationTheme recovers art when live seed matches global id', () => {
  const liveGlobal = {
    ...withArt,
    id: 'mp3-test-bg',
    backgroundImage: '/tmp/live-editor.jpg',
  }
  const staleList = {
    ...withArt,
    backgroundImage: null,
  }
  const t = audioPresentationTheme(
    { themeId: 'mp3-test-bg' },
    liveGlobal,
    [staleList],
  )
  assert.equal(t.backgroundImage, '/tmp/live-editor.jpg')
})
