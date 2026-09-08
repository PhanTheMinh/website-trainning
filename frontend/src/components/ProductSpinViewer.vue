<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  detailRoute: {
    type: [Object, String],
    default: null
  },
  label: {
    type: String,
    default: 'Sản phẩm 360 độ'
  },
  spriteUrl: {
    type: String,
    default: '/products/turntable/runstore-black-shoe-8-angle.png'
  },
  videoUrl: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: ''
  },
  accent: {
    type: String,
    default: '#b9f25d'
  },
  objectTilt: {
    type: String,
    default: '0deg'
  },
  spriteAspect: {
    type: Number,
    default: 0.889
  },
  compact: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const videoElement = ref(null)
const videoDuration = ref(0)
const videoTime = ref(0)
const videoFailed = ref(false)
const frameIndex = ref(0)
const dragging = ref(false)
const paused = ref(false)
let pointerStart = 0
let pointerDistance = 0
let startFrame = 0
let videoStartTime = 0
let rotationTimer
let resumeTimer
let reducedMotionQuery

const normalizedFrame = computed(() => ((frameIndex.value % 8) + 8) % 8)
const spriteStyle = computed(() => {
  const column = normalizedFrame.value % 4
  const row = Math.floor(normalizedFrame.value / 4)
  return {
    backgroundImage: `url('${props.spriteUrl}')`,
    backgroundPosition: `${column * 33.3333}% ${row * 100}%`
  }
})
const viewerStyle = computed(() => ({
  '--spin-accent': props.accent,
  '--spin-object-tilt': props.objectTilt,
  '--spin-sprite-aspect': props.spriteAspect,
  '--spin-duration': videoDuration.value
    ? `${videoDuration.value / 0.72}s`
    : props.compact ? '8.4s' : '7.2s'
}))
const angle = computed(() => videoDuration.value
  ? Math.round((videoTime.value / videoDuration.value) * 360) % 360
  : normalizedFrame.value * 45
)

function pauseTemporarily() {
  paused.value = true
  window.clearTimeout(resumeTimer)
  resumeTimer = window.setTimeout(() => {
    paused.value = false
  }, 1600)
}

function handlePointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  dragging.value = true
  paused.value = true
  pointerStart = event.clientX
  pointerDistance = 0
  startFrame = normalizedFrame.value
  videoStartTime = videoElement.value?.currentTime || 0
  videoElement.value?.pause()
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handlePointerMove(event) {
  if (!dragging.value) return
  pointerDistance = event.clientX - pointerStart

  if (videoElement.value && videoDuration.value) {
    const nextTime = videoStartTime + (pointerDistance / 180) * videoDuration.value
    videoElement.value.currentTime = (
      (nextTime % videoDuration.value) + videoDuration.value
    ) % videoDuration.value
    return
  }

  frameIndex.value = startFrame + Math.round(pointerDistance / 22)
}

function handlePointerEnd() {
  if (!dragging.value) return
  dragging.value = false
  pauseTemporarily()
  if (!reducedMotionQuery?.matches) videoElement.value?.play().catch(() => {})
}

function openProduct() {
  if (Math.abs(pointerDistance) > 8 || !props.detailRoute) {
    pointerDistance = 0
    return
  }
  router.push(props.detailRoute)
}

function rotateBy(direction) {
  if (videoElement.value && videoDuration.value) {
    videoElement.value.currentTime = (
      videoElement.value.currentTime + direction * (videoDuration.value / 24) + videoDuration.value
    ) % videoDuration.value
    pauseTemporarily()
    return
  }

  frameIndex.value += direction
  pauseTemporarily()
}

function handleVideoReady() {
  videoDuration.value = videoElement.value?.duration || 0
  if (videoElement.value) videoElement.value.playbackRate = 0.72
  if (reducedMotionQuery?.matches) videoElement.value?.pause()
}

function updateVideoTime() {
  videoTime.value = videoElement.value?.currentTime || 0
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  rotationTimer = window.setInterval(() => {
    if ((!props.videoUrl || videoFailed.value) &&
      !paused.value && !reducedMotionQuery?.matches) {
      frameIndex.value += 1
    }
  }, props.compact ? 1050 : 900)
})

onBeforeUnmount(() => {
  window.clearInterval(rotationTimer)
  window.clearTimeout(resumeTimer)
})
</script>

<template>
  <div
    class="spin-viewer"
    :class="{ 'is-compact': compact, 'is-dragging': dragging }"
    :style="viewerStyle"
    role="link"
    tabindex="0"
    :aria-label="`Xem chi tiết ${label}`"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @click="openProduct"
    @keydown.enter="openProduct"
    @keydown.left.prevent="rotateBy(-1)"
    @keydown.right.prevent="rotateBy(1)"
  >
    <div class="spin-viewer__halo" aria-hidden="true"></div>
    <video
      v-if="videoUrl && !videoFailed"
      ref="videoElement"
      class="spin-viewer__video"
      :aria-label="label"
      autoplay
      loop
      muted
      playsinline
      preload="auto"
      @loadedmetadata="handleVideoReady"
      @timeupdate="updateVideoTime"
      @error="videoFailed = true"
    >
      <source :src="videoUrl" type="video/mp4" />
    </video>
    <div
      v-else-if="spriteUrl"
      class="spin-viewer__sprite"
      :style="spriteStyle"
      aria-hidden="true"
    ></div>
    <img
      v-else-if="imageUrl"
      class="spin-viewer__image"
      :src="imageUrl"
      :alt="label"
      draggable="false"
    />
    <div class="spin-viewer__shadow" aria-hidden="true"></div>
    <div class="spin-viewer__pedestal" aria-hidden="true">
      <div class="spin-viewer__pedestal-top"></div>
      <div class="spin-viewer__name-window">
        <div class="spin-viewer__name-track">
          <span>{{ label }}</span><i>◆</i><span>{{ label }}</span><i>◆</i><span>{{ label }}</span>
        </div>
      </div>
    </div>
    <span v-if="!compact" class="spin-viewer__angle">{{ String(angle).padStart(3, '0') }}°</span>
    <span class="spin-viewer__hint" aria-hidden="true">← Kéo để xoay →</span>
  </div>
</template>
