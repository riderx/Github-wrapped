<template>
  <div class="app">
    <header class="header">
      <div class="container">
        <h1 class="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          GitHub Wrapped
        </h1>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <!-- Input Form -->
        <div v-if="!wrappedData && !loading" class="form-section fade-in">
          <h2 class="title">See Your GitHub Year in Review</h2>
          <p class="subtitle">Enter a GitHub username or organization to generate their wrapped</p>
          
          <form @submit.prevent="fetchWrapped" class="form">
            <div class="info-box">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
              </svg>
              <div>
                <strong>Note:</strong> Due to GitHub API rate limits, providing an API token is recommended for best results, especially for accounts with many repositories.
              </div>
            </div>

            <div class="form-group">
              <label for="username">GitHub Username or Organization</label>
              <input
                id="username"
                v-model="username"
                type="text"
                placeholder="e.g., octocat"
                required
              />
            </div>

            <div class="advanced-toggle">
              <button type="button" @click="showAdvanced = !showAdvanced" class="toggle-btn">
                {{ showAdvanced ? '▼' : '▶' }} Advanced Options
              </button>
            </div>

            <div v-if="showAdvanced" class="advanced-options fade-in">
              <div class="form-group">
                <label for="year">Year</label>
                <select id="year" v-model="year">
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="2023">2023</option>
                  <option value="2022">2022</option>
                  <option value="2021">2021</option>
                </select>
              </div>

              <div class="form-group">
                <label for="token">GitHub API Token (Optional - for private repos)</label>
                <input
                  id="token"
                  v-model="apiToken"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                />
                <small>Token is never stored, only used for API requests</small>
              </div>
            </div>

            <button type="submit" class="submit-btn" :disabled="!username.trim()">
              Generate Wrapped
            </button>
          </form>

          <div v-if="error" class="error-message fade-in">
            {{ error }}
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-section fade-in">
          <div class="spinner"></div>
          <p>Analyzing GitHub activity...</p>
        </div>

        <!-- Wrapped Display -->
        <div v-if="wrappedData && !loading" class="wrapped-section fade-in">
          <GitHubWrapped :data="wrappedData" @reset="reset" />
        </div>
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        <p>Made with ❤️ using Vue.js and Cloudflare Workers</p>
      </div>
    </footer>
  </div>
</template>

<script>
import { ref } from 'vue'
import GitHubWrapped from './components/GitHubWrapped.vue'

export default {
  name: 'App',
  components: {
    GitHubWrapped
  },
  setup() {
    const username = ref('')
    const year = ref('2025')
    const apiToken = ref('')
    const showAdvanced = ref(false)
    const loading = ref(false)
    const error = ref('')
    const wrappedData = ref(null)

    const fetchWrapped = async () => {
      if (!username.value.trim()) {
        error.value = 'Please enter a username'
        return
      }

      loading.value = true
      error.value = ''
      wrappedData.value = null

      try {
        // Build API URL
        const apiUrl = new URL('/api/wrapped', window.location.origin)
        apiUrl.searchParams.set('username', username.value.trim())
        apiUrl.searchParams.set('year', year.value)
        if (apiToken.value.trim()) {
          apiUrl.searchParams.set('token', apiToken.value.trim())
        }

        const response = await fetch(apiUrl.toString())
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch data')
        }

        const data = await response.json()
        wrappedData.value = data
      } catch (err) {
        error.value = err.message || 'An error occurred while fetching data'
      } finally {
        loading.value = false
      }
    }

    const reset = () => {
      wrappedData.value = null
      username.value = ''
      apiToken.value = ''
      error.value = ''
    }

    return {
      username,
      year,
      apiToken,
      showAdvanced,
      loading,
      error,
      wrappedData,
      fetchWrapped,
      reset
    }
  }
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 1.5rem 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.logo svg {
  color: var(--accent);
}

.main {
  flex: 1;
  padding: 3rem 0;
}

.form-section {
  max-width: 600px;
  margin: 0 auto;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, var(--accent) 0%, var(--success) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 2rem;
  font-size: 1.1rem;
}

.form {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.info-box {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(88, 166, 255, 0.1);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.info-box svg {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--accent);
}

.info-box strong {
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 1rem;
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--accent);
}

.form-group small {
  display: block;
  margin-top: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.advanced-toggle {
  margin-bottom: 1rem;
}

.toggle-btn {
  background: transparent;
  color: var(--accent);
  font-size: 0.9rem;
  padding: 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-btn:hover {
  color: var(--accent-hover);
}

.advanced-options {
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.submit-btn {
  width: 100%;
  padding: 1rem;
  background: var(--accent);
  color: white;
  font-weight: 600;
  font-size: 1rem;
  border-radius: 6px;
  transition: background 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 6px;
  color: #f85149;
  text-align: center;
}

.loading-section {
  text-align: center;
  padding: 3rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  padding: 2rem 0;
  text-align: center;
  color: var(--text-secondary);
  margin-top: auto;
}

@media (max-width: 768px) {
  .title {
    font-size: 2rem;
  }
  
  .form {
    padding: 1.5rem;
  }
}
</style>
