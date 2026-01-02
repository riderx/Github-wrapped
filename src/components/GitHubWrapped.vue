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
        <p class="hero-subtitle">@{{ data.user.login }}'s Year in Code</p>
        <p v-if="insights?.mainTheme" class="hero-theme">{{ insights.mainTheme }}</p>
      </div>
    </section>

    <!-- Executive Summary -->
    <section v-if="insights?.executiveSummary" class="section executive-summary fade-in">
      <div class="section-content">
        <h2 class="section-title">Executive Summary</h2>
        <div class="narrative-text" v-html="formatParagraphs(insights.executiveSummary)"></div>
      </div>
    </section>

    <!-- Your Story -->
    <section v-if="insights?.story" class="section story-section fade-in">
      <div class="section-content">
        <h2 class="section-title">Your Story</h2>
        <div class="story-text" v-html="formatParagraphs(insights.story)"></div>
      </div>
    </section>

    <!-- Year in Numbers -->
    <section class="section stats-section fade-in">
      <div class="section-content">
        <h2 class="section-title">{{ insights?.yearInNumbers?.headline || 'Your Year in Numbers' }}</h2>
        <div class="stats-grid">
          <div class="stat-card primary">
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
          <div v-if="insights?._rawStats?.longestStreak" class="stat-card">
            <div class="stat-number">{{ insights._rawStats.longestStreak }}</div>
            <div class="stat-label">Day Streak</div>
          </div>
          <div v-if="insights?._rawStats?.weekendCommits" class="stat-card">
            <div class="stat-number">{{ formatNumber(insights._rawStats.weekendCommits) }}</div>
            <div class="stat-label">Weekend Commits</div>
          </div>
        </div>

        <!-- Statistical Insights -->
        <div v-if="insights?.yearInNumbers?.insights?.length" class="insights-list">
          <div v-for="(insight, index) in insights.yearInNumbers.insights" :key="index" class="insight-item">
            <span class="insight-bullet">•</span>
            <span>{{ insight }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Challenges Conquered -->
    <section v-if="hasStruggles" class="section struggles-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">💪</span>
          Challenges Conquered
        </h2>
        <div v-if="insights?.biggestStruggles?.overview" class="overview-text">
          {{ insights.biggestStruggles.overview }}
        </div>
        <ul class="detail-list">
          <li v-for="(struggle, index) in strugglesList" :key="index" class="detail-item">
            {{ struggle }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Proud Moments -->
    <section v-if="hasProudMoments" class="section proud-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">🏆</span>
          Proud Moments
        </h2>
        <div v-if="insights?.proudMoments?.overview" class="overview-text">
          {{ insights.proudMoments.overview }}
        </div>
        <ul class="detail-list achievements">
          <li v-for="(moment, index) in proudMomentsList" :key="index" class="detail-item">
            {{ moment }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Project Spotlight -->
    <section v-if="insights?.projectSpotlight?.projects?.length" class="section projects-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">📁</span>
          Project Spotlight
        </h2>
        <div v-if="insights.projectSpotlight.overview" class="overview-text">
          {{ insights.projectSpotlight.overview }}
        </div>
        <div class="projects-grid">
          <div v-for="(project, index) in insights.projectSpotlight.projects" :key="index" class="project-card">
            <h3 class="project-name">{{ project.name }}</h3>
            <p class="project-narrative">{{ project.narrative }}</p>
            <p v-if="project.impact" class="project-impact">{{ project.impact }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Work Style -->
    <section v-if="insights?.workStyle" class="section workstyle-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">🎨</span>
          Your Coding Style
        </h2>
        <div v-if="insights.workStyle.description" class="workstyle-description">
          {{ insights.workStyle.description }}
        </div>
        <div class="workstyle-grid">
          <div v-if="insights.workStyle.strengths?.length" class="workstyle-card strengths">
            <h3>Strengths</h3>
            <ul>
              <li v-for="(strength, i) in insights.workStyle.strengths" :key="i">{{ strength }}</li>
            </ul>
          </div>
          <div v-if="insights.workStyle.growthAreas?.length" class="workstyle-card growth">
            <h3>Growth Areas</h3>
            <ul>
              <li v-for="(area, i) in insights.workStyle.growthAreas" :key="i">{{ area }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Technical Evolution -->
    <section v-if="insights?.technicalEvolution" class="section evolution-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">📈</span>
          Technical Evolution
        </h2>
        <div v-if="insights.technicalEvolution.narrative" class="narrative-text" v-html="formatParagraphs(insights.technicalEvolution.narrative)"></div>
        <div v-if="insights.technicalEvolution.keyTransitions?.length" class="transitions-list">
          <h3>Key Transitions</h3>
          <ul>
            <li v-for="(transition, i) in insights.technicalEvolution.keyTransitions" :key="i">{{ transition }}</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Top Languages -->
    <section v-if="data.stats.topLanguages.length > 0" class="section languages-section fade-in">
      <div class="section-content">
        <h2 class="section-title">Top Languages</h2>
        <div class="languages-list">
          <div v-for="(lang, index) in data.stats.topLanguages.slice(0, 5)" :key="lang.language" class="language-item">
            <span class="language-rank">{{ index + 1 }}</span>
            <span class="language-name">{{ lang.language }}</span>
            <div class="language-bar-container">
              <div class="language-bar" :style="{ width: getLanguageWidth(lang.commits) }"></div>
            </div>
            <span class="language-count">{{ formatNumber(lang.commits) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Month by Month -->
    <section v-if="insights?.monthByMonth" class="section monthly-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">📅</span>
          Month by Month
        </h2>
        <div v-if="insights.monthByMonth.narrative" class="overview-text">
          {{ insights.monthByMonth.narrative }}
        </div>
        <div class="monthly-grid">
          <div v-if="insights.monthByMonth.peaks?.length" class="monthly-card peaks">
            <h3>Peak Periods</h3>
            <ul>
              <li v-for="(peak, i) in insights.monthByMonth.peaks" :key="i">{{ peak }}</li>
            </ul>
          </div>
          <div v-if="insights.monthByMonth.valleys?.length" class="monthly-card valleys">
            <h3>Slower Periods</h3>
            <ul>
              <li v-for="(valley, i) in insights.monthByMonth.valleys" :key="i">{{ valley }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Topics Explored -->
    <section v-if="topicsList?.length" class="section topics-section fade-in">
      <div class="section-content">
        <h2 class="section-title">Topics You Explored</h2>
        <div class="topics-grid">
          <span v-for="(topic, index) in topicsList" :key="index" class="topic-tag">
            {{ topic }}
          </span>
        </div>
      </div>
    </section>

    <!-- Fun Facts -->
    <section v-if="funFactsList?.length" class="section funfacts-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">✨</span>
          Fun Facts
        </h2>
        <div class="funfacts-grid">
          <div v-for="(fact, index) in funFactsList" :key="index" class="funfact-card">
            <span class="funfact-number">{{ index + 1 }}</span>
            <p>{{ fact }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Quotable Commits -->
    <section v-if="insights?.quotableCommits?.length" class="section quotes-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">💬</span>
          Quotable Commits
        </h2>
        <div class="quotes-list">
          <blockquote v-for="(quote, index) in insights.quotableCommits" :key="index" class="commit-quote">
            "{{ quote }}"
          </blockquote>
        </div>
      </div>
    </section>

    <!-- Year Ahead Outlook -->
    <section v-if="insights?.yearAheadOutlook" class="section outlook-section fade-in">
      <div class="section-content">
        <h2 class="section-title">
          <span class="section-icon">🔮</span>
          Looking Ahead
        </h2>
        <div class="outlook-text">
          {{ insights.yearAheadOutlook }}
        </div>
      </div>
    </section>

    <!-- Final Words -->
    <section class="section closing-section fade-in">
      <div class="section-content centered">
        <h2 class="closing-title">{{ data.year }} was your year.</h2>
        <p v-if="insights?.finalWords" class="closing-quote">{{ insights.finalWords }}</p>
        <p v-else class="closing-text">Keep building. Keep growing.</p>
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
import { ref, computed } from 'vue'

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

    // Computed property for insights
    const insights = computed(() => props.data.insights || {})

    // Handle both old and new format for struggles
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

    // Handle both old and new format for proud moments
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

    // Handle topics
    const topicsList = computed(() => {
      return insights.value.topicsExplored || []
    })

    // Handle fun facts (both array and single string)
    const funFactsList = computed(() => {
      const i = insights.value
      if (Array.isArray(i.funFacts)) return i.funFacts
      if (i.funFact) return [i.funFact]
      return []
    })

    const formatNumber = (num) => {
      return (num || 0).toLocaleString()
    }

    const formatParagraphs = (text) => {
      if (!text) return ''
      return text.split('\n\n').map(p => `<p>${p}</p>`).join('')
    }

    const getLanguageWidth = (commits) => {
      const max = props.data.stats.topLanguages[0]?.commits || 1
      return `${(commits / max) * 100}%`
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
        showNotification('Copied!')
      }).catch(() => {
        showNotification('Unable to copy')
      })
    }

    return {
      showToast,
      toastMessage,
      insights,
      hasStruggles,
      strugglesList,
      hasProudMoments,
      proudMomentsList,
      topicsList,
      funFactsList,
      formatNumber,
      formatParagraphs,
      getLanguageWidth,
      shareWrapped
    }
  }
}
</script>

<style scoped>
.wrapped {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-xl) var(--space-lg);
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
  min-height: 80vh;
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
  font-size: 5rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.hero-subtitle {
  font-size: var(--font-subheading);
  color: var(--text-secondary);
  margin-bottom: var(--space-lg);
}

.hero-theme {
  font-size: var(--font-body-lg);
  color: var(--accent-primary);
  font-style: italic;
  max-width: 600px;
  margin: 0 auto;
}

/* Sections */
.section {
  margin-bottom: var(--space-xl);
  padding: var(--space-xl) 0;
  border-bottom: 1px solid var(--border);
}

.section:last-of-type {
  border-bottom: none;
}

.section-content {
  max-width: 800px;
  margin: 0 auto;
}

.section-content.centered {
  text-align: center;
}

.section-title {
  font-size: var(--font-heading);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.section-icon {
  font-size: 1.5rem;
}

/* Executive Summary & Story */
.executive-summary, .story-section {
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
}

.narrative-text {
  font-size: var(--font-body-lg);
  line-height: 1.8;
  color: var(--text-secondary);
}

.narrative-text :deep(p) {
  margin-bottom: var(--space-md);
}

.narrative-text :deep(p:last-child) {
  margin-bottom: 0;
}

.story-text {
  font-size: var(--font-subheading);
  line-height: 1.7;
  color: var(--text-primary);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.stat-card {
  background: var(--bg-secondary);
  padding: var(--space-lg);
  border-radius: 12px;
  text-align: center;
}

.stat-card.primary {
  background: var(--accent-primary);
  color: var(--bg-primary);
}

.stat-card.primary .stat-number {
  color: var(--bg-primary);
}

.stat-card.primary .stat-label {
  color: var(--bg-primary);
  opacity: 0.8;
}

.stat-number {
  font-size: var(--font-title);
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

/* Insights List */
.insights-list {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: var(--space-lg);
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.insight-bullet {
  color: var(--accent-primary);
  font-weight: bold;
}

/* Overview text */
.overview-text {
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: var(--space-lg);
  padding: var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 12px;
  border-left: 4px solid var(--accent-primary);
}

/* Detail Lists */
.detail-list {
  list-style: none;
  padding: 0;
}

.detail-item {
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: var(--font-body);
  color: var(--text-secondary);
  line-height: 1.6;
  border-left: 3px solid var(--text-secondary);
}

.detail-list.achievements .detail-item {
  border-left-color: var(--accent-primary);
}

/* Projects Grid */
.projects-grid {
  display: grid;
  gap: var(--space-lg);
}

.project-card {
  background: var(--bg-secondary);
  padding: var(--space-lg);
  border-radius: 12px;
}

.project-name {
  font-size: var(--font-body-lg);
  font-weight: 700;
  color: var(--accent-primary);
  margin-bottom: var(--space-sm);
}

.project-narrative {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-sm);
}

.project-impact {
  color: var(--text-primary);
  font-style: italic;
  font-size: var(--font-caption);
}

/* Work Style */
.workstyle-description {
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: var(--space-lg);
}

.workstyle-grid, .monthly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.workstyle-card, .monthly-card {
  background: var(--bg-secondary);
  padding: var(--space-lg);
  border-radius: 12px;
}

.workstyle-card h3, .monthly-card h3 {
  font-size: var(--font-body-lg);
  font-weight: 700;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
}

.workstyle-card.strengths h3 {
  color: var(--accent-primary);
}

.workstyle-card ul, .monthly-card ul {
  list-style: none;
  padding: 0;
}

.workstyle-card li, .monthly-card li {
  padding: var(--space-sm) 0;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.workstyle-card li:last-child, .monthly-card li:last-child {
  border-bottom: none;
}

/* Languages */
.languages-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.language-item {
  display: grid;
  grid-template-columns: 2.5rem 1fr 2fr auto;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
}

.language-rank {
  font-size: var(--font-subheading);
  font-weight: 700;
  color: var(--text-secondary);
  text-align: center;
}

.language-name {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--text-primary);
}

.language-bar-container {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.language-bar {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.language-count {
  font-size: var(--font-caption);
  color: var(--text-secondary);
  min-width: 60px;
  text-align: right;
}

/* Transitions */
.transitions-list {
  margin-top: var(--space-lg);
  padding: var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 12px;
}

.transitions-list h3 {
  font-size: var(--font-body-lg);
  font-weight: 700;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
}

.transitions-list ul {
  list-style: none;
  padding: 0;
}

.transitions-list li {
  padding: var(--space-sm) 0;
  color: var(--text-secondary);
  padding-left: var(--space-lg);
  position: relative;
}

.transitions-list li::before {
  content: '→';
  position: absolute;
  left: 0;
  color: var(--accent-primary);
}

/* Topics */
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
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}

.topic-tag:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Fun Facts */
.funfacts-grid {
  display: grid;
  gap: var(--space-md);
}

.funfact-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 12px;
}

.funfact-number {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: var(--accent-primary);
  color: var(--bg-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--font-caption);
}

.funfact-card p {
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Quotes */
.quotes-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.commit-quote {
  font-size: var(--font-body-lg);
  font-style: italic;
  color: var(--text-secondary);
  padding: var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 12px;
  border-left: 4px solid var(--accent-primary);
  margin: 0;
  line-height: 1.6;
}

/* Outlook */
.outlook-text {
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
  line-height: 1.8;
  padding: var(--space-xl);
  background: linear-gradient(135deg, var(--bg-secondary), transparent);
  border-radius: 16px;
  border: 1px solid var(--border);
}

/* Closing Section */
.closing-section {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-bottom: none;
}

.closing-title {
  font-size: var(--font-hero);
  font-weight: 700;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.closing-quote {
  font-size: var(--font-subheading);
  color: var(--accent-primary);
  font-style: italic;
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
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
  padding-top: var(--space-xl);
  border-top: 1px solid var(--border);
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
  .wrapped {
    padding: var(--space-lg) var(--space-md);
  }

  .hero-year {
    font-size: 3.5rem;
  }

  .section {
    padding: var(--space-lg) 0;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }

  .stat-number {
    font-size: var(--font-subheading);
  }

  .language-item {
    grid-template-columns: 2rem 1fr auto;
  }

  .language-bar-container {
    display: none;
  }

  .closing-title {
    font-size: var(--font-title);
  }

  .workstyle-grid, .monthly-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
