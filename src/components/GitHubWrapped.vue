<template>
  <div class="stories-container" @keydown="handleKeydown" tabindex="0" ref="storiesContainer">
    <!-- Progress Bar -->
    <div class="progress-bar">
      <div
        v-for="(_, index) in totalSlides"
        :key="index"
        class="progress-segment"
        :class="{ active: index === currentSlide, completed: index < currentSlide }"
      ></div>
    </div>

    <!-- Navigation Arrows -->
    <button
      v-if="currentSlide > 0"
      class="nav-arrow nav-prev"
      @click="prevSlide"
      aria-label="Previous slide"
    >
      ‹
    </button>
    <button
      v-if="currentSlide < totalSlides - 1"
      class="nav-arrow nav-next"
      @click="nextSlide"
      aria-label="Next slide"
    >
      ›
    </button>

    <!-- Touch Areas for Mobile -->
    <div class="touch-area touch-left" @click="prevSlide"></div>
    <div class="touch-area touch-right" @click="nextSlide"></div>

    <!-- Toast notification -->
    <div v-if="showToast" class="toast">
      {{ toastMessage }}
    </div>

    <!-- Story Slides -->
    <div class="slides-wrapper" :style="{ transform: `translateX(-${currentSlide * 100}%)` }">

      <!-- Slide 1: Hero -->
      <div class="slide slide-hero">
        <div class="hero-content">
          <div class="hero-avatar-wrapper">
            <img :src="data.user.avatar" :alt="data.user.login" class="hero-avatar" />
            <span class="avatar-sparkle">✨</span>
          </div>
          <h1 class="hero-year">{{ data.year }}</h1>
          <p class="hero-subtitle">@{{ data.user.login }}'s Year in Code</p>
          <p v-if="insights?.mainTheme" class="hero-theme">{{ insights.mainTheme }}</p>
          <div class="scroll-hint">
            <span>Tap to start</span>
            <span class="arrow-right">→</span>
          </div>
        </div>
      </div>

      <!-- Slide 2: Stats Bento -->
      <div class="slide slide-stats">
        <h2 class="slide-title">📊 Your Year in Numbers</h2>
        <p class="slide-subtitle">{{ insights?.yearInNumbers?.headline || "Here's what you built" }}</p>

        <div class="bento-grid stats-bento">
          <div class="bento-card bento-large primary">
            <span class="bento-emoji">🔥</span>
            <div class="bento-number">{{ formatNumber(data.stats.totalCommits) }}</div>
            <div class="bento-label">Commits</div>
          </div>
          <div class="bento-card">
            <span class="bento-emoji">📁</span>
            <div class="bento-number">{{ data.stats.repositoriesContributed }}</div>
            <div class="bento-label">Repos</div>
          </div>
          <div class="bento-card">
            <span class="bento-emoji">🔀</span>
            <div class="bento-number">{{ formatNumber(data.stats.pullRequests) }}</div>
            <div class="bento-label">PRs</div>
          </div>
          <div class="bento-card">
            <span class="bento-emoji">🐛</span>
            <div class="bento-number">{{ formatNumber(data.stats.issues) }}</div>
            <div class="bento-label">Issues</div>
          </div>
          <div v-if="insights?._rawStats?.longestStreak" class="bento-card bento-wide">
            <span class="bento-emoji">⚡</span>
            <div class="bento-number">{{ insights._rawStats.longestStreak }}</div>
            <div class="bento-label">Day Streak</div>
            <div v-if="insights._rawStats.longestStreak > 365" class="bento-extra">
              {{ insights._rawStats.longestStreakStart }} → {{ insights._rawStats.longestStreakEnd }}
            </div>
          </div>
          <div v-if="insights?._rawStats?.weekendCommits" class="bento-card">
            <span class="bento-emoji">🌙</span>
            <div class="bento-number">{{ formatNumber(insights._rawStats.weekendCommits) }}</div>
            <div class="bento-label">Weekend</div>
          </div>
        </div>
      </div>

      <!-- Slide 3: Your Story (Executive Summary) -->
      <div class="slide slide-story" v-if="insights?.executiveSummary || insights?.story">
        <h2 class="slide-title">📖 Your Story</h2>
        <div class="story-card">
          <div class="story-text" v-if="insights?.executiveSummary">
            {{ insights.executiveSummary }}
          </div>
          <div class="story-text story-secondary" v-if="insights?.story">
            {{ truncateStory(insights.story) }}
          </div>
        </div>
      </div>

      <!-- Slide 4: Languages -->
      <div class="slide slide-languages" v-if="data.stats.topLanguages.length > 0">
        <h2 class="slide-title">💻 Your Languages</h2>
        <p class="slide-subtitle">The code you speak</p>

        <div class="languages-bento">
          <div
            v-for="(lang, index) in data.stats.topLanguages.slice(0, 5)"
            :key="lang.language"
            class="lang-card"
            :class="{ 'lang-first': index === 0 }"
          >
            <span class="lang-medal">{{ getMedal(index) }}</span>
            <span class="lang-name">{{ lang.language }}</span>
            <div class="lang-bar-wrapper">
              <div class="lang-bar" :style="{ width: getLanguageWidth(lang.commits) }"></div>
            </div>
            <span class="lang-count">{{ formatNumber(lang.commits) }}</span>
          </div>
        </div>
      </div>

      <!-- Slide 5: Achievements -->
      <div class="slide slide-achievements" v-if="hasProudMoments || hasStruggles">
        <h2 class="slide-title">🏆 Level Up!</h2>
        <p class="slide-subtitle">Your wins & challenges</p>

        <div class="achievements-grid">
          <div v-if="hasProudMoments" class="achievement-section wins">
            <h3>🌟 Proud Moments</h3>
            <div v-if="insights?.proudMoments?.overview" class="achievement-overview">
              {{ insights.proudMoments.overview }}
            </div>
            <ul class="achievement-list">
              <li v-for="(moment, i) in proudMomentsList.slice(0, 3)" :key="i">
                ✅ {{ moment }}
              </li>
            </ul>
          </div>
          <div v-if="hasStruggles" class="achievement-section challenges">
            <h3>💪 Challenges Conquered</h3>
            <div v-if="insights?.biggestStruggles?.overview" class="achievement-overview">
              {{ insights.biggestStruggles.overview }}
            </div>
            <ul class="achievement-list">
              <li v-for="(struggle, i) in strugglesList.slice(0, 3)" :key="i">
                🎯 {{ struggle }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Slide 6: Projects -->
      <div class="slide slide-projects" v-if="insights?.projectSpotlight?.projects?.length">
        <h2 class="slide-title">🚀 Project Spotlight</h2>
        <p class="slide-subtitle" v-if="insights.projectSpotlight.overview">
          {{ insights.projectSpotlight.overview }}
        </p>

        <div class="projects-bento">
          <div
            v-for="(project, index) in insights.projectSpotlight.projects.slice(0, 4)"
            :key="index"
            class="project-card"
            :class="{ 'project-featured': index === 0 }"
          >
            <span class="project-icon">{{ getProjectEmoji(index) }}</span>
            <h3 class="project-name">{{ project.name }}</h3>
            <p class="project-desc">{{ project.narrative }}</p>
            <p v-if="project.impact" class="project-impact">💡 {{ project.impact }}</p>
          </div>
        </div>
      </div>

      <!-- Slide 7: Work Style -->
      <div class="slide slide-style" v-if="insights?.workStyle">
        <h2 class="slide-title">🎨 Your Coding Style</h2>
        <p class="slide-subtitle" v-if="insights.workStyle.description">
          {{ insights.workStyle.description }}
        </p>

        <div class="style-grid">
          <div v-if="insights.workStyle.strengths?.length" class="style-card strengths">
            <h3>💎 Strengths</h3>
            <ul>
              <li v-for="(s, i) in insights.workStyle.strengths.slice(0, 4)" :key="i">{{ s }}</li>
            </ul>
          </div>
          <div v-if="insights.workStyle.growthAreas?.length" class="style-card growth">
            <h3>🌱 Growth Areas</h3>
            <ul>
              <li v-for="(g, i) in insights.workStyle.growthAreas.slice(0, 4)" :key="i">{{ g }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Slide 8: Fun Facts -->
      <div class="slide slide-funfacts" v-if="funFactsList?.length">
        <h2 class="slide-title">✨ Fun Facts</h2>
        <p class="slide-subtitle">The quirky stuff</p>

        <div class="funfacts-bento">
          <div
            v-for="(fact, index) in funFactsList.slice(0, 4)"
            :key="index"
            class="funfact-card"
          >
            <span class="funfact-emoji">{{ getFunEmoji(index) }}</span>
            <p>{{ fact }}</p>
          </div>
        </div>
      </div>

      <!-- Slide 9: Topics & Evolution -->
      <div class="slide slide-topics" v-if="topicsList?.length || insights?.technicalEvolution">
        <h2 class="slide-title">📈 Your Evolution</h2>

        <div v-if="insights?.technicalEvolution?.narrative" class="evolution-text">
          {{ truncateText(insights.technicalEvolution.narrative, 200) }}
        </div>

        <div v-if="topicsList?.length" class="topics-cloud">
          <span
            v-for="(topic, index) in topicsList.slice(0, 12)"
            :key="index"
            class="topic-pill"
            :class="{ highlight: index < 3 }"
          >
            {{ topic }}
          </span>
        </div>

        <div v-if="insights?.technicalEvolution?.keyTransitions?.length" class="transitions">
          <div
            v-for="(t, i) in insights.technicalEvolution.keyTransitions.slice(0, 3)"
            :key="i"
            class="transition-item"
          >
            → {{ t }}
          </div>
        </div>
      </div>

      <!-- Slide 10: Quotes -->
      <div class="slide slide-quotes" v-if="insights?.quotableCommits?.length">
        <h2 class="slide-title">💬 Quotable Commits</h2>
        <p class="slide-subtitle">Words for the ages</p>

        <div class="quotes-list">
          <blockquote
            v-for="(quote, index) in insights.quotableCommits.slice(0, 3)"
            :key="index"
            class="quote-card"
          >
            <span class="quote-mark">"</span>
            {{ quote }}
            <span class="quote-mark">"</span>
          </blockquote>
        </div>
      </div>

      <!-- Slide 11: Month by Month -->
      <div class="slide slide-monthly" v-if="insights?.monthByMonth">
        <h2 class="slide-title">📅 Month by Month</h2>
        <p class="slide-subtitle" v-if="insights.monthByMonth.narrative">
          {{ truncateText(insights.monthByMonth.narrative, 150) }}
        </p>

        <div class="monthly-grid">
          <div v-if="insights.monthByMonth.peaks?.length" class="monthly-card peaks">
            <h3>🔥 Peak Periods</h3>
            <ul>
              <li v-for="(p, i) in insights.monthByMonth.peaks.slice(0, 3)" :key="i">{{ p }}</li>
            </ul>
          </div>
          <div v-if="insights.monthByMonth.valleys?.length" class="monthly-card valleys">
            <h3>🧘 Slower Times</h3>
            <ul>
              <li v-for="(v, i) in insights.monthByMonth.valleys.slice(0, 3)" :key="i">{{ v }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Slide 12: Looking Ahead -->
      <div class="slide slide-future" v-if="insights?.yearAheadOutlook">
        <h2 class="slide-title">🔮 Looking Ahead</h2>

        <div class="future-card">
          <div class="future-text">
            {{ insights.yearAheadOutlook }}
          </div>
        </div>
      </div>

      <!-- Final Slide: Closing -->
      <div class="slide slide-closing">
        <div class="closing-content">
          <div class="closing-emoji">🎉</div>
          <h1 class="closing-year">{{ data.year }}</h1>
          <p class="closing-headline">was your year.</p>
          <p v-if="insights?.finalWords" class="closing-message">{{ insights.finalWords }}</p>
          <p v-else class="closing-message">Keep building. Keep growing. 🚀</p>

          <div class="closing-actions">
            <button @click="shareWrapped" class="action-btn share">
              📤 Share
            </button>
            <button @click="$emit('reset')" class="action-btn restart">
              🔄 Start Over
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Slide Counter -->
    <div class="slide-counter">
      {{ currentSlide + 1 }} / {{ totalSlides }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'

export default {
  name: 'GitHubWrapped',
  props: {
    data: {
      type: Object,
      required: true
    }
  },
  emits: ['reset'],
  setup(props, { emit }) {
    const currentSlide = ref(0)
    const showToast = ref(false)
    const toastMessage = ref('')
    const storiesContainer = ref(null)

    const insights = computed(() => props.data.insights || {})

    // Calculate which slides should be shown based on available data
    const availableSlides = computed(() => {
      const slides = ['hero', 'stats']
      if (insights.value.executiveSummary || insights.value.story) slides.push('story')
      if (props.data.stats.topLanguages?.length > 0) slides.push('languages')
      if (hasProudMoments.value || hasStruggles.value) slides.push('achievements')
      if (insights.value.projectSpotlight?.projects?.length) slides.push('projects')
      if (insights.value.workStyle) slides.push('style')
      if (funFactsList.value?.length) slides.push('funfacts')
      if (topicsList.value?.length || insights.value.technicalEvolution) slides.push('topics')
      if (insights.value.quotableCommits?.length) slides.push('quotes')
      if (insights.value.monthByMonth) slides.push('monthly')
      if (insights.value.yearAheadOutlook) slides.push('future')
      slides.push('closing')
      return slides
    })

    const totalSlides = computed(() => availableSlides.value.length)

    const hasStruggles = computed(() => {
      const i = insights.value
      return i.biggestStruggles?.challenges?.length > 0 ||
             (Array.isArray(i.biggestStruggles) && i.biggestStruggles.length > 0)
    })

    const strugglesList = computed(() => {
      const i = insights.value
      if (i.biggestStruggles?.challenges) return i.biggestStruggles.challenges
      if (Array.isArray(i.biggestStruggles)) return i.biggestStruggles
      return []
    })

    const hasProudMoments = computed(() => {
      const i = insights.value
      return i.proudMoments?.achievements?.length > 0 ||
             (Array.isArray(i.proudMoments) && i.proudMoments.length > 0)
    })

    const proudMomentsList = computed(() => {
      const i = insights.value
      if (i.proudMoments?.achievements) return i.proudMoments.achievements
      if (Array.isArray(i.proudMoments)) return i.proudMoments
      return []
    })

    const topicsList = computed(() => insights.value.topicsExplored || [])

    const funFactsList = computed(() => {
      const i = insights.value
      if (Array.isArray(i.funFacts)) return i.funFacts
      if (i.funFact) return [i.funFact]
      return []
    })

    const nextSlide = () => {
      if (currentSlide.value < totalSlides.value - 1) {
        currentSlide.value++
      }
    }

    const prevSlide = () => {
      if (currentSlide.value > 0) {
        currentSlide.value--
      }
    }

    const handleKeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        nextSlide()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevSlide()
      }
    }

    // Touch handling
    let touchStartX = 0
    let touchEndX = 0

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX
    }

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX
      handleSwipe()
    }

    const handleSwipe = () => {
      const swipeThreshold = 50
      const diff = touchStartX - touchEndX
      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          nextSlide()
        } else {
          prevSlide()
        }
      }
    }

    onMounted(() => {
      if (storiesContainer.value) {
        storiesContainer.value.focus()
        storiesContainer.value.addEventListener('touchstart', handleTouchStart)
        storiesContainer.value.addEventListener('touchend', handleTouchEnd)
      }
    })

    onUnmounted(() => {
      if (storiesContainer.value) {
        storiesContainer.value.removeEventListener('touchstart', handleTouchStart)
        storiesContainer.value.removeEventListener('touchend', handleTouchEnd)
      }
    })

    const formatNumber = (num) => (num || 0).toLocaleString()

    const getLanguageWidth = (commits) => {
      const max = props.data.stats.topLanguages[0]?.commits || 1
      return `${(commits / max) * 100}%`
    }

    const truncateStory = (text) => {
      if (!text) return ''
      return text.length > 300 ? text.substring(0, 300) + '...' : text
    }

    const truncateText = (text, maxLen) => {
      if (!text) return ''
      return text.length > maxLen ? text.substring(0, maxLen) + '...' : text
    }

    const getMedal = (index) => {
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
      return medals[index] || ''
    }

    const getProjectEmoji = (index) => {
      const emojis = ['⭐', '🌟', '💫', '✨']
      return emojis[index] || '📦'
    }

    const getFunEmoji = (index) => {
      const emojis = ['🎲', '🎯', '🎪', '🎨']
      return emojis[index] || '✨'
    }

    const showNotification = (message) => {
      toastMessage.value = message
      showToast.value = true
      setTimeout(() => {
        showToast.value = false
      }, 3000)
    }

    const shareWrapped = () => {
      const text = `🎉 My ${props.data.year} GitHub Wrapped:\n\n🔥 ${formatNumber(props.data.stats.totalCommits)} commits\n📁 ${props.data.stats.repositoriesContributed} repos\n🔀 ${formatNumber(props.data.stats.pullRequests)} PRs\n\nCheck out your wrapped!`
      const url = window.location.href

      if (navigator.share) {
        navigator.share({
          title: `My ${props.data.year} GitHub Wrapped`,
          text: text,
          url: url
        }).catch(() => copyToClipboard(text))
      } else {
        copyToClipboard(text)
      }
    }

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text).then(() => {
        showNotification('📋 Copied!')
      }).catch(() => {
        showNotification('Unable to copy')
      })
    }

    return {
      currentSlide,
      totalSlides,
      showToast,
      toastMessage,
      storiesContainer,
      insights,
      hasStruggles,
      strugglesList,
      hasProudMoments,
      proudMomentsList,
      topicsList,
      funFactsList,
      nextSlide,
      prevSlide,
      handleKeydown,
      formatNumber,
      getLanguageWidth,
      truncateStory,
      truncateText,
      getMedal,
      getProjectEmoji,
      getFunEmoji,
      shareWrapped
    }
  }
}
</script>

<style scoped>
.stories-container {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  overflow: hidden;
  outline: none;
}

/* Progress Bar */
.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  z-index: 100;
  background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
}

.progress-segment {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,0.3);
  border-radius: 2px;
  transition: background 0.3s ease;
}

.progress-segment.completed {
  background: var(--accent-primary);
}

.progress-segment.active {
  background: var(--text-primary);
}

/* Navigation Arrows */
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 50%;
  color: var(--text-primary);
  font-size: 24px;
  cursor: pointer;
  z-index: 100;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-arrow:hover {
  background: rgba(255,255,255,0.2);
  transform: translateY(-50%) scale(1.1);
}

.nav-prev {
  left: 16px;
}

.nav-next {
  right: 16px;
}

/* Touch Areas (invisible tap zones for mobile) */
.touch-area {
  position: absolute;
  top: 60px;
  bottom: 60px;
  width: 30%;
  z-index: 50;
  cursor: pointer;
}

.touch-left {
  left: 0;
}

.touch-right {
  right: 0;
}

/* Toast */
.toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent-primary);
  color: var(--bg-primary);
  padding: 12px 24px;
  border-radius: 24px;
  font-weight: 600;
  z-index: 200;
  animation: fadeIn 0.3s ease;
}

/* Slides Wrapper */
.slides-wrapper {
  display: flex;
  height: 100%;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Individual Slide */
.slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Slide Counter */
.slide-counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text-secondary);
  font-size: 12px;
  z-index: 100;
}

/* Slide Titles */
.slide-title {
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  font-weight: 700;
  margin-bottom: 8px;
  text-align: center;
}

.slide-subtitle {
  color: var(--text-secondary);
  font-size: clamp(0.875rem, 2.5vw, 1.125rem);
  text-align: center;
  margin-bottom: 24px;
  max-width: 600px;
}

/* ==================== HERO SLIDE ==================== */
.slide-hero {
  background: radial-gradient(ellipse at center, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.hero-content {
  text-align: center;
}

.hero-avatar-wrapper {
  position: relative;
  display: inline-block;
  margin-bottom: 24px;
}

.hero-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid var(--accent-primary);
  box-shadow: 0 0 40px rgba(29, 185, 84, 0.3);
}

.avatar-sparkle {
  position: absolute;
  top: -10px;
  right: -10px;
  font-size: 32px;
  animation: sparkle 2s ease-in-out infinite;
}

@keyframes sparkle {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.2) rotate(15deg); }
}

.hero-year {
  font-size: clamp(4rem, 15vw, 8rem);
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(135deg, var(--text-primary), var(--accent-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
}

.hero-subtitle {
  font-size: clamp(1rem, 3vw, 1.5rem);
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.hero-theme {
  font-size: clamp(0.875rem, 2.5vw, 1.125rem);
  color: var(--accent-primary);
  font-style: italic;
  max-width: 500px;
  margin: 0 auto 32px;
}

.scroll-hint {
  color: var(--text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.arrow-right {
  font-size: 18px;
}

/* ==================== STATS BENTO SLIDE ==================== */
.bento-grid {
  display: grid;
  gap: 12px;
  width: 100%;
  max-width: 500px;
}

.stats-bento {
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: minmax(100px, auto);
}

.bento-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: transform 0.2s ease;
}

.bento-card:hover {
  transform: scale(1.02);
}

.bento-card.bento-large {
  grid-column: span 2;
  padding: 32px 20px;
}

.bento-card.bento-wide {
  grid-column: span 2;
}

.bento-card.primary {
  background: linear-gradient(135deg, var(--accent-primary), #15843e);
}

.bento-card.primary .bento-number,
.bento-card.primary .bento-label {
  color: var(--bg-primary);
}

.bento-emoji {
  font-size: 28px;
  margin-bottom: 8px;
}

.bento-number {
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.bento-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 4px;
}

.bento-extra {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 8px;
  opacity: 0.7;
}

/* ==================== STORY SLIDE ==================== */
.slide-story {
  padding-top: 80px;
}

.story-card {
  background: var(--bg-secondary);
  border-radius: 24px;
  padding: 32px;
  max-width: 600px;
  width: 100%;
}

.story-text {
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  line-height: 1.8;
  color: var(--text-primary);
}

.story-secondary {
  margin-top: 24px;
  color: var(--text-secondary);
  font-size: clamp(0.875rem, 2vw, 1rem);
}

/* ==================== LANGUAGES SLIDE ==================== */
.languages-bento {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lang-card {
  display: grid;
  grid-template-columns: 40px 1fr 2fr 60px;
  align-items: center;
  gap: 12px;
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 16px 20px;
}

.lang-card.lang-first {
  background: linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated));
  border: 1px solid rgba(29, 185, 84, 0.3);
}

.lang-medal {
  font-size: 24px;
  text-align: center;
}

.lang-name {
  font-weight: 600;
  color: var(--text-primary);
}

.lang-bar-wrapper {
  height: 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
  overflow: hidden;
}

.lang-bar {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.lang-count {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: right;
}

/* ==================== ACHIEVEMENTS SLIDE ==================== */
.achievements-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

@media (min-width: 600px) {
  .achievements-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.achievement-section {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 24px;
}

.achievement-section h3 {
  font-size: 1.125rem;
  margin-bottom: 12px;
}

.achievement-overview {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.achievement-list {
  list-style: none;
  padding: 0;
}

.achievement-list li {
  padding: 8px 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
  border-bottom: 1px solid var(--border);
}

.achievement-list li:last-child {
  border-bottom: none;
}

.achievement-section.wins {
  border-left: 4px solid var(--accent-primary);
}

.achievement-section.challenges {
  border-left: 4px solid var(--accent-warning);
}

/* ==================== PROJECTS SLIDE ==================== */
.projects-bento {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 600px;
}

.project-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 20px;
}

.project-card.project-featured {
  grid-column: span 2;
  background: linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated));
  border: 1px solid rgba(29, 185, 84, 0.2);
}

.project-icon {
  font-size: 24px;
  display: block;
  margin-bottom: 8px;
}

.project-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-primary);
  margin-bottom: 8px;
}

.project-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.project-impact {
  font-size: 0.75rem;
  color: var(--text-primary);
  margin-top: 12px;
  font-style: italic;
}

/* ==================== WORK STYLE SLIDE ==================== */
.style-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

@media (min-width: 500px) {
  .style-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.style-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 24px;
}

.style-card h3 {
  font-size: 1rem;
  margin-bottom: 16px;
}

.style-card ul {
  list-style: none;
  padding: 0;
}

.style-card li {
  padding: 8px 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border);
}

.style-card li:last-child {
  border-bottom: none;
}

.style-card.strengths {
  border-top: 4px solid var(--accent-primary);
}

.style-card.growth {
  border-top: 4px solid #8B5CF6;
}

/* ==================== FUN FACTS SLIDE ==================== */
.funfacts-bento {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 500px;
}

.funfact-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 20px;
  text-align: center;
}

.funfact-emoji {
  font-size: 32px;
  display: block;
  margin-bottom: 12px;
}

.funfact-card p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ==================== TOPICS SLIDE ==================== */
.evolution-text {
  font-size: 1rem;
  color: var(--text-secondary);
  max-width: 600px;
  text-align: center;
  margin-bottom: 24px;
  line-height: 1.6;
}

.topics-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 600px;
  margin-bottom: 24px;
}

.topic-pill {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-radius: 20px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}

.topic-pill.highlight {
  background: var(--accent-primary);
  color: var(--bg-primary);
  border-color: var(--accent-primary);
}

.transitions {
  max-width: 500px;
}

.transition-item {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 8px;
}

/* ==================== QUOTES SLIDE ==================== */
.quotes-list {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quote-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 24px;
  font-size: 1.125rem;
  font-style: italic;
  color: var(--text-secondary);
  line-height: 1.6;
  border-left: 4px solid var(--accent-primary);
  margin: 0;
}

.quote-mark {
  color: var(--accent-primary);
  font-size: 1.5rem;
}

/* ==================== MONTHLY SLIDE ==================== */
.monthly-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

@media (min-width: 500px) {
  .monthly-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.monthly-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 24px;
}

.monthly-card h3 {
  font-size: 1rem;
  margin-bottom: 16px;
}

.monthly-card ul {
  list-style: none;
  padding: 0;
}

.monthly-card li {
  padding: 8px 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border);
}

.monthly-card li:last-child {
  border-bottom: none;
}

.monthly-card.peaks {
  border-top: 4px solid #F97316;
}

.monthly-card.valleys {
  border-top: 4px solid #06B6D4;
}

/* ==================== FUTURE SLIDE ==================== */
.future-card {
  background: linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated));
  border-radius: 24px;
  padding: 32px;
  max-width: 600px;
  border: 1px solid rgba(29, 185, 84, 0.2);
}

.future-text {
  font-size: 1.125rem;
  line-height: 1.8;
  color: var(--text-primary);
  text-align: center;
}

/* ==================== CLOSING SLIDE ==================== */
.slide-closing {
  background: radial-gradient(ellipse at center, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.closing-content {
  text-align: center;
}

.closing-emoji {
  font-size: 64px;
  margin-bottom: 24px;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.closing-year {
  font-size: clamp(4rem, 15vw, 8rem);
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(135deg, var(--accent-primary), #15843e);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.closing-headline {
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  color: var(--text-primary);
  margin-bottom: 24px;
}

.closing-message {
  font-size: 1.125rem;
  color: var(--text-secondary);
  max-width: 500px;
  line-height: 1.6;
  margin-bottom: 40px;
}

.closing-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-btn {
  padding: 16px 32px;
  border-radius: 30px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn.share {
  background: var(--accent-primary);
  color: var(--bg-primary);
}

.action-btn.share:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(29, 185, 84, 0.4);
}

.action-btn.restart {
  background: transparent;
  color: var(--text-primary);
  border: 2px solid var(--border);
}

.action-btn.restart:hover {
  border-color: var(--text-primary);
}

/* ==================== RESPONSIVE ==================== */
@media (max-width: 768px) {
  .nav-arrow {
    display: none;
  }

  .slide {
    padding: 50px 16px;
  }

  .bento-grid {
    max-width: 100%;
  }

  .projects-bento {
    grid-template-columns: 1fr;
  }

  .project-card.project-featured {
    grid-column: span 1;
  }

  .funfacts-bento {
    grid-template-columns: 1fr;
  }

  .lang-card {
    grid-template-columns: 32px 1fr 60px;
  }

  .lang-bar-wrapper {
    display: none;
  }
}

@media (min-width: 769px) {
  .touch-area {
    display: none;
  }
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Scrollbar for slide content */
.slide::-webkit-scrollbar {
  width: 4px;
}

.slide::-webkit-scrollbar-track {
  background: transparent;
}

.slide::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .slides-wrapper {
    transition: none;
  }

  .avatar-sparkle,
  .scroll-hint,
  .closing-emoji {
    animation: none;
  }
}
</style>
