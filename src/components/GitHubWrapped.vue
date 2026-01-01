<template>
  <div class="wrapped">
    <!-- User Header -->
    <div class="user-header fade-in">
      <img :src="data.user.avatar" :alt="data.user.login" class="avatar" />
      <h2 class="user-name">{{ data.user.name || data.user.login }}</h2>
      <p class="user-login">@{{ data.user.login }}</p>
      <p v-if="data.user.bio" class="user-bio">{{ data.user.bio }}</p>
      <div class="user-stats">
        <div class="stat">
          <span class="stat-value">{{ data.user.followers }}</span>
          <span class="stat-label">Followers</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ data.user.following }}</span>
          <span class="stat-label">Following</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ data.user.publicRepos }}</span>
          <span class="stat-label">Repos</span>
        </div>
      </div>
    </div>

    <!-- Year Banner -->
    <div class="year-banner fade-in">
      <h1 class="year-title">{{ data.year }} GitHub Wrapped</h1>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card fade-in" style="animation-delay: 0.1s">
        <div class="stat-icon">📝</div>
        <div class="stat-number">{{ formatNumber(data.stats.totalCommits) }}</div>
        <div class="stat-title">Total Commits</div>
        <div class="stat-desc">Lines of code written</div>
      </div>

      <div class="stat-card fade-in" style="animation-delay: 0.2s">
        <div class="stat-icon">🎯</div>
        <div class="stat-number">{{ formatNumber(data.stats.pullRequests) }}</div>
        <div class="stat-title">Pull Requests</div>
        <div class="stat-desc">Code contributions</div>
      </div>

      <div class="stat-card fade-in" style="animation-delay: 0.3s">
        <div class="stat-icon">🐛</div>
        <div class="stat-number">{{ formatNumber(data.stats.issues) }}</div>
        <div class="stat-title">Issues</div>
        <div class="stat-desc">Problems solved</div>
      </div>

      <div class="stat-card fade-in" style="animation-delay: 0.4s">
        <div class="stat-icon">👀</div>
        <div class="stat-number">{{ formatNumber(data.stats.reviews) }}</div>
        <div class="stat-title">Code Reviews</div>
        <div class="stat-desc">Feedback given</div>
      </div>
    </div>

    <!-- Top Languages -->
    <div v-if="data.stats.topLanguages.length > 0" class="section fade-in">
      <h3 class="section-title">🔥 Top Languages</h3>
      <div class="languages">
        <div
          v-for="(lang, index) in data.stats.topLanguages"
          :key="lang.language"
          class="language-item fade-in"
          :style="{ animationDelay: `${0.5 + index * 0.1}s` }"
        >
          <div class="language-info">
            <span class="language-name">{{ lang.language }}</span>
            <span class="language-commits">{{ formatNumber(lang.commits) }} commits</span>
          </div>
          <div class="language-bar">
            <div
              class="language-bar-fill"
              :style="{ width: `${getLanguagePercent(lang.commits)}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top Repositories -->
    <div v-if="data.stats.topRepositories.length > 0" class="section fade-in">
      <h3 class="section-title">⭐ Most Active Repositories</h3>
      <div class="repos">
        <div
          v-for="(repo, index) in data.stats.topRepositories"
          :key="repo.fullName"
          class="repo-item fade-in"
          :style="{ animationDelay: `${0.7 + index * 0.1}s` }"
        >
          <div class="repo-header">
            <span class="repo-name">{{ repo.fullName }}</span>
            <span class="repo-stars">⭐ {{ formatNumber(repo.stars) }}</span>
          </div>
          <div class="repo-stats">
            <span class="repo-commits">{{ formatNumber(repo.commits) }} commits</span>
            <span v-if="repo.language" class="repo-language">
              <span class="language-dot" :style="{ background: getLanguageColor(repo.language) }"></span>
              {{ repo.language }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div class="summary fade-in">
      <h3 class="summary-title">🎉 {{ data.year }} was an amazing year!</h3>
      <p class="summary-text">
        You contributed to <strong>{{ data.stats.repositoriesContributed }}</strong> 
        {{ data.stats.repositoriesContributed === 1 ? 'repository' : 'repositories' }}
        with <strong>{{ formatNumber(data.stats.totalCommits) }}</strong> commits.
        Keep up the great work in {{ data.year + 1 }}!
      </p>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button @click="$emit('reset')" class="action-btn secondary">
        Generate Another
      </button>
      <button @click="shareWrapped" class="action-btn primary">
        Share Results
      </button>
    </div>
  </div>
</template>

<script>
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
    const formatNumber = (num) => {
      return num.toLocaleString()
    }

    const getLanguagePercent = (commits) => {
      const maxCommits = Math.max(...props.data.stats.topLanguages.map(l => l.commits))
      return (commits / maxCommits) * 100
    }

    const getLanguageColor = (language) => {
      const colors = {
        JavaScript: '#f1e05a',
        TypeScript: '#3178c6',
        Python: '#3572A5',
        Java: '#b07219',
        Go: '#00ADD8',
        Rust: '#dea584',
        Ruby: '#701516',
        PHP: '#4F5D95',
        C: '#555555',
        'C++': '#f34b7d',
        'C#': '#178600',
        Swift: '#F05138',
        Kotlin: '#A97BFF',
        Dart: '#00B4AB',
        HTML: '#e34c26',
        CSS: '#563d7c',
        Vue: '#41b883',
        Shell: '#89e051',
      }
      return colors[language] || '#8b949e'
    }

    const shareWrapped = () => {
      const text = `My ${props.data.year} GitHub Wrapped: ${props.data.stats.totalCommits} commits, ${props.data.stats.repositoriesContributed} repos! 🎉`
      const url = window.location.href
      
      if (navigator.share) {
        navigator.share({
          title: 'My GitHub Wrapped',
          text: text,
          url: url
        }).catch(() => {
          // Fallback to copying text
          copyToClipboard(text)
        })
      } else {
        copyToClipboard(text)
      }
    }

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!')
      })
    }

    return {
      formatNumber,
      getLanguagePercent,
      getLanguageColor,
      shareWrapped
    }
  }
}
</script>

<style scoped>
.wrapped {
  max-width: 900px;
  margin: 0 auto;
}

.user-header {
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border);
  margin-bottom: 2rem;
}

.avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid var(--accent);
  margin-bottom: 1rem;
}

.user-name {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.user-login {
  color: var(--text-secondary);
  font-size: 1.25rem;
  margin-bottom: 1rem;
}

.user-bio {
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto 1.5rem;
}

.user-stats {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.year-banner {
  text-align: center;
  padding: 3rem 0;
}

.year-title {
  font-size: 3.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent) 0%, var(--success) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.stat-card {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  text-align: center;
  transition: transform 0.2s, border-color 0.2s;
}

.stat-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent);
}

.stat-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.stat-number {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 0.5rem;
}

.stat-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.stat-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.section {
  margin-bottom: 3rem;
}

.section-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}

.languages {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.language-item {
  margin-bottom: 1.5rem;
}

.language-item:last-child {
  margin-bottom: 0;
}

.language-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.language-name {
  font-weight: 600;
}

.language-commits {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.language-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.language-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--success));
  border-radius: 4px;
  transition: width 1s ease-out;
}

.repos {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.repo-item {
  background: var(--bg-secondary);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: transform 0.2s, border-color 0.2s;
}

.repo-item:hover {
  transform: translateX(8px);
  border-color: var(--accent);
}

.repo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.repo-name {
  font-weight: 600;
  font-size: 1.1rem;
}

.repo-stars {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.repo-stats {
  display: flex;
  gap: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.repo-commits {
  font-weight: 500;
}

.repo-language {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.language-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.summary {
  text-align: center;
  padding: 3rem 2rem;
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.1), rgba(63, 185, 80, 0.1));
  border-radius: 12px;
  margin-bottom: 2rem;
}

.summary-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.summary-text {
  font-size: 1.1rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.summary-text strong {
  color: var(--accent);
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 3rem;
}

.action-btn {
  padding: 1rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--accent);
  color: white;
}

.action-btn.primary:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.action-btn.secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.action-btn.secondary:hover {
  border-color: var(--accent);
  transform: scale(1.05);
}

@media (max-width: 768px) {
  .year-title {
    font-size: 2.5rem;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-card {
    padding: 1.5rem;
  }

  .stat-number {
    font-size: 2rem;
  }

  .user-stats {
    gap: 1rem;
  }

  .actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
