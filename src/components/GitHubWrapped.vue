<template>
  <div class="wrapped">
    <!-- Toast notification -->
    <div v-if="showToast" class="toast fade-in">
      {{ toastMessage }}
    </div>

    <!-- Hero Section -->
    <section class="hero-section fade-in">
      <div class="hero-content">
        <img :src="data.user.avatar" :alt="data.user.login" class="hero-avatar" />
        <h1 class="hero-year">{{ data.year }}</h1>
        <p class="hero-subtitle">@{{ data.user.login }}'s year in code</p>
      </div>
    </section>

    <!-- Story Card -->
    <section v-if="data.insights && data.insights.story" class="story-card fade-in">
      <div class="card-content">
        <h2 class="card-title">Your Story</h2>
        <p class="story-text">{{ data.insights.story }}</p>
      </div>
    </section>

    <!-- Main Theme -->
    <section v-if="data.insights && data.insights.mainTheme" class="theme-card fade-in">
      <div class="card-content">
        <div class="theme-icon">🎯</div>
        <h2 class="theme-title">{{ data.insights.mainTheme }}</h2>
      </div>
    </section>

    <!-- Stats Grid -->
    <section class="stats-section fade-in">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{{ formatNumber(data.stats.totalCommits) }}</div>
          <div class="stat-label">Commits</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{{ data.stats.repositoriesContributed }}</div>
          <div class="stat-label">Repositories</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{{ formatNumber(data.stats.pullRequests) }}</div>
          <div class="stat-label">Pull Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{{ formatNumber(data.stats.issues) }}</div>
          <div class="stat-label">Issues</div>
        </div>
      </div>
    </section>

    <!-- AI Insights - Struggles -->
    <section v-if="data.insights && data.insights.biggestStruggles && data.insights.biggestStruggles.length > 0" class="insight-card struggles-card fade-in">
      <div class="card-content">
        <h2 class="insight-title">
          <span class="insight-icon">💪</span>
          Challenges Conquered
        </h2>
        <ul class="insight-list">
          <li v-for="(struggle, index) in data.insights.biggestStruggles" :key="index" class="insight-item">
            {{ struggle }}
          </li>
        </ul>
      </div>
    </section>

    <!-- AI Insights - Proud Moments -->
    <section v-if="data.insights && data.insights.proudMoments && data.insights.proudMoments.length > 0" class="insight-card proud-card fade-in">
      <div class="card-content">
        <h2 class="insight-title">
          <span class="insight-icon">🎉</span>
          Proud Moments
        </h2>
        <ul class="insight-list">
          <li v-for="(moment, index) in data.insights.proudMoments" :key="index" class="insight-item">
            {{ moment }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Top Languages -->
    <section v-if="data.stats.topLanguages.length > 0" class="languages-section fade-in">
      <div class="card-content">
        <h2 class="section-title">Top Languages</h2>
        <div class="languages-list">
          <div v-for="(lang, index) in data.stats.topLanguages.slice(0, 3)" :key="lang.language" class="language-item">
            <span class="language-rank">{{ index + 1 }}</span>
            <span class="language-name">{{ lang.language }}</span>
            <span class="language-count">{{ formatNumber(lang.commits) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Work Style -->
    <section v-if="data.insights && data.insights.workStyle" class="workstyle-card fade-in">
      <div class="card-content">
        <h2 class="card-title">Your Style</h2>
        <p class="workstyle-text">{{ data.insights.workStyle.description || `You're a ${data.insights.workStyle.approach} developer with a ${data.insights.workStyle.pace} pace.` }}</p>
      </div>
    </section>

    <!-- Topics Explored -->
    <section v-if="data.insights && data.insights.topicsExplored && data.insights.topicsExplored.length > 0" class="topics-card fade-in">
      <div class="card-content">
        <h2 class="card-title">Topics You Explored</h2>
        <div class="topics-grid">
          <span v-for="(topic, index) in data.insights.topicsExplored" :key="index" class="topic-tag">
            {{ topic }}
          </span>
        </div>
      </div>
    </section>

    <!-- Fun Fact -->
    <section v-if="data.insights && data.insights.funFact" class="funfact-card fade-in">
      <div class="card-content">
        <div class="funfact-icon">✨</div>
        <p class="funfact-text">{{ data.insights.funFact }}</p>
      </div>
    </section>

    <!-- Closing Card -->
    <section class="closing-card fade-in">
      <div class="card-content">
        <h2 class="closing-title">{{ data.year }} was your year.</h2>
        <p class="closing-text">Keep building. Keep growing.</p>
      </div>
    </section>

    <!-- Actions -->
    <div class="actions">
      <button @click="$emit('reset')" class="action-btn secondary">
        Start Over
      </button>
      <button @click="shareWrapped" class="action-btn primary">
        Share
      </button>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'GitHubWrapped',
  props: {
    data: {
      type: Object,
      required: true
    }
  },
  emits: ['reset'],
  setup(props) {
    const showToast = ref(false)
    const toastMessage = ref('')

    const formatNumber = (num) => {
      return num.toLocaleString()
    }

    const showNotification = (message) => {
      toastMessage.value = message
      showToast.value = true
      setTimeout(() => {
        showToast.value = false
      }, 3000)
    }

    const shareWrapped = () => {
      const text = `My ${props.data.year} GitHub Wrapped: ${props.data.stats.totalCommits} commits across ${props.data.stats.repositoriesContributed} repos!`
      const url = window.location.href
      
      if (navigator.share) {
        navigator.share({
          title: 'My GitHub Wrapped',
          text: text,
          url: url
        }).catch(() => {
          copyToClipboard(text)
        })
      } else {
        copyToClipboard(text)
      }
    }

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text).then(() => {
        showNotification('✓ Copied!')
      }).catch(() => {
        showNotification('Unable to copy')
      })
    }

    return {
      showToast,
      toastMessage,
      formatNumber,
      shareWrapped
    }
  }
}
</script>

<style scoped>
.wrapped {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-xl) 0;
}

.toast {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  background: var(--accent-primary);
  color: var(--bg-primary);
  padding: var(--space-md) var(--space-lg);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  font-weight: 600;
  font-size: var(--font-caption);
}

/* Hero Section */
.hero-section {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin-bottom: var(--space-xl);
}

.hero-content {
  animation-delay: 0.2s;
}

.hero-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid var(--accent-primary);
  margin-bottom: var(--space-lg);
}

.hero-year {
  font-size: 6rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.hero-subtitle {
  font-size: var(--font-subheading);
  color: var(--text-secondary);
}

/* Story Card */
.story-card {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
}

.story-text {
  font-size: var(--font-heading);
  line-height: 1.6;
  color: var(--text-primary);
  text-align: center;
  max-width: 700px;
}

/* Theme Card */
.theme-card {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  text-align: center;
}

.theme-icon {
  font-size: 4rem;
  margin-bottom: var(--space-lg);
}

.theme-title {
  font-size: var(--font-title);
  line-height: 1.3;
  color: var(--text-primary);
  font-weight: 700;
}

/* Stats Grid */
.stats-section {
  margin-bottom: var(--space-xl);
  padding: var(--space-xl) 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.stat-card {
  background: var(--bg-secondary);
  padding: var(--space-xl);
  border-radius: 12px;
  text-align: center;
}

.stat-number {
  font-size: var(--font-hero);
  font-weight: 700;
  color: var(--accent-primary);
  line-height: 1;
  margin-bottom: var(--space-sm);
}

.stat-label {
  font-size: var(--font-caption);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Insight Cards */
.insight-card {
  margin-bottom: var(--space-xl);
  padding: var(--space-xl);
}

.card-content {
  max-width: 700px;
  margin: 0 auto;
}

.card-title {
  font-size: var(--font-heading);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}

.insight-title {
  font-size: var(--font-subheading);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.insight-icon {
  font-size: 2rem;
}

.insight-list {
  list-style: none;
  padding: 0;
}

.insight-item {
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
  line-height: 1.6;
}

.insight-item:last-child {
  border-bottom: none;
}

/* Languages */
.languages-section {
  margin-bottom: var(--space-xl);
  padding: var(--space-xl);
}

.section-title {
  font-size: var(--font-heading);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}

.languages-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.language-item {
  display: grid;
  grid-template-columns: 3rem 1fr auto;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md) 0;
}

.language-rank {
  font-size: var(--font-title);
  font-weight: 700;
  color: var(--text-secondary);
  text-align: center;
}

.language-name {
  font-size: var(--font-subheading);
  font-weight: 600;
  color: var(--text-primary);
}

.language-count {
  font-size: var(--font-body);
  color: var(--text-secondary);
}

/* Work Style */
.workstyle-card {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
}

.workstyle-text {
  font-size: var(--font-subheading);
  line-height: 1.6;
  color: var(--text-secondary);
  text-align: center;
  max-width: 600px;
}

/* Topics */
.topics-card {
  margin-bottom: var(--space-xl);
  padding: var(--space-xl);
}

.topics-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.topic-tag {
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 24px;
  font-size: var(--font-body);
  color: var(--text-secondary);
}

/* Fun Fact */
.funfact-card {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  text-align: center;
}

.funfact-icon {
  font-size: 3rem;
  margin-bottom: var(--space-lg);
}

.funfact-text {
  font-size: var(--font-subheading);
  line-height: 1.6;
  color: var(--text-primary);
  max-width: 600px;
  margin: 0 auto;
}

/* Closing Card */
.closing-card {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin-bottom: var(--space-xl);
}

.closing-title {
  font-size: var(--font-hero);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.closing-text {
  font-size: var(--font-subheading);
  color: var(--text-secondary);
}

/* Actions */
.actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
  margin: var(--space-xl) 0;
}

.action-btn {
  padding: var(--space-md) var(--space-xl);
  border-radius: 24px;
  font-weight: 700;
  font-size: var(--font-body);
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.action-btn.primary {
  background: var(--accent-primary);
  color: var(--bg-primary);
}

.action-btn.primary:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(29, 185, 84, 0.3);
}

.action-btn.secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.action-btn.secondary:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
}

@media (max-width: 768px) {
  .hero-year {
    font-size: 4rem;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .stat-number {
    font-size: var(--font-title);
  }

  .story-text,
  .theme-title {
    font-size: var(--font-subheading);
  }

  .closing-title {
    font-size: var(--font-title);
  }

  .actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
