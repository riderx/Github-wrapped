<template>
  <div class="app">
    <main class="main">
      <div class="container">
        <!-- Input Form -->
        <div v-if="!wrappedData && !loading" class="form-section fade-in">
          <h1 class="form-title">Your GitHub Year</h1>
          <p class="form-subtitle">Enter a username to reveal their story</p>
          
          <div class="token-notice">
            <span class="notice-icon">🔑</span>
            <p class="notice-text">
              <strong>API Token Required:</strong> To get accurate and complete commit data, 
              please provide your GitHub token in Advanced Options below.
            </p>
          </div>
          
          <form @submit.prevent="fetchWrapped" class="form">
            <div class="form-group">
              <input
                id="username"
                v-model="username"
                type="text"
                placeholder="GitHub username..."
                required
                class="input-main"
              />
            </div>

            <div class="advanced-toggle">
              <button type="button" @click="showAdvanced = !showAdvanced" class="toggle-btn">
                {{ showAdvanced ? '−' : '+' }} Advanced Options (Token Required)
              </button>
            </div>

            <div v-if="showAdvanced" class="advanced-options fade-in">
              <div class="form-row">
                <div class="form-group">
                  <label for="year">Year</label>
                  <select id="year" v-model="year" class="select-input">
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                    <option value="2023">2023</option>
                    <option value="2022">2022</option>
                    <option value="2021">2021</option>
                  </select>
                </div>

                <div class="form-group">
                  <label for="token">API Token (Required) *</label>
                  <input
                    id="token"
                    v-model="apiToken"
                    type="password"
                    placeholder="ghp_xxxxx..."
                    class="select-input"
                  />
                </div>
              </div>
              <p class="token-help">
                Get your token from 
                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">
                  GitHub Settings
                </a>
                (needs 'repo' scope)
              </p>
            </div>

            <button type="submit" class="submit-btn" :disabled="!username.trim()">
              Generate
            </button>
          </form>

          <div v-if="error" class="error-message fade-in">
            {{ error }}
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-section fade-in">
          <div class="spinner"></div>
          <p class="loading-text">Reading your story...</p>
        </div>

        <!-- Wrapped Display -->
        <div v-if="wrappedData && !loading">
          <GitHubWrapped :data="wrappedData" @reset="reset" />
        </div>
      </div>
    </main>
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
  background: var(--bg-primary);
}

.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) 0;
  min-height: 100vh;
}

.form-section {
  max-width: 500px;
  margin: 0 auto;
  text-align: center;
}

.token-notice {
  background: linear-gradient(135deg, rgba(29, 185, 84, 0.1), rgba(29, 185, 84, 0.05));
  border: 2px solid rgba(29, 185, 84, 0.3);
  border-radius: 12px;
  padding: var(--space-lg);
  margin: var(--space-xl) 0;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  text-align: left;
}

.notice-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.notice-text {
  font-size: var(--font-body);
  color: var(--text-primary);
  line-height: 1.5;
  margin: 0;
}

.notice-text strong {
  color: var(--accent-primary);
  display: block;
  margin-bottom: var(--space-xs);
}

.form-title {
  font-size: var(--font-hero);
  font-weight: 700;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.form-subtitle {
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
  margin-bottom: var(--space-xl);
}

.form {
  margin-top: var(--space-lg);
}

.form-group {
  margin-bottom: var(--space-lg);
}

.form-group label {
  display: block;
  margin-bottom: var(--space-sm);
  font-size: var(--font-caption);
  color: var(--text-secondary);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-main {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-primary);
  font-size: var(--font-body-lg);
  transition: all 0.2s ease;
  text-align: center;
}

.input-main:focus {
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
}

.input-main::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

.select-input {
  width: 100%;
  padding: var(--space-md);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-body);
}

.select-input:focus {
  border-color: var(--accent-primary);
}

.advanced-toggle {
  margin: var(--space-lg) 0;
}

.toggle-btn {
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-caption);
  padding: var(--space-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: 0 auto;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}

.toggle-btn:hover {
  color: var(--text-primary);
}

.advanced-options {
  margin-top: var(--space-lg);
}

.token-help {
  margin-top: var(--space-md);
  font-size: var(--font-caption);
  color: var(--text-secondary);
  text-align: left;
}

.token-help a {
  color: var(--accent-primary);
  text-decoration: none;
}

.token-help a:hover {
  text-decoration: underline;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.submit-btn {
  width: 100%;
  padding: var(--space-md) var(--space-xl);
  background: var(--accent-primary);
  color: var(--bg-primary);
  font-weight: 700;
  font-size: var(--font-body);
  border-radius: 24px;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: var(--space-lg);
}

.submit-btn:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(29, 185, 84, 0.3);
}

.submit-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.error-message {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 8px;
  color: var(--accent-warning);
  font-size: var(--font-caption);
}

.loading-section {
  text-align: center;
  padding: var(--space-xl);
}

.spinner {
  width: 60px;
  height: 60px;
  border: 3px solid var(--bg-elevated);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto var(--space-lg);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: var(--font-body-lg);
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .form-title {
    font-size: 2.5rem;
  }
  
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .main {
    padding: var(--space-lg) 0;
  }
}
</style>
