<template>
  <div class="app">
    <main class="main">
      <div class="container">
        <!-- User Info Header -->
        <div v-if="isAuthenticated" class="user-header fade-in">
          <div class="user-info">
            <img :src="currentUser.avatar" :alt="currentUser.name" class="user-avatar" />
            <span class="user-name">{{ currentUser.name || currentUser.login }}</span>
          </div>
          <button @click="logout" class="logout-btn">Sign Out</button>
        </div>

        <!-- Input Form -->
        <div v-if="!wrappedData && !loading" class="form-section fade-in">
          <h1 class="form-title">Your GitHub Year</h1>
          <p class="form-subtitle">Enter a username to reveal their story</p>
          
          <!-- Login prompt if not authenticated -->
          <div v-if="!isAuthenticated" class="login-prompt">
            <p class="login-message">Sign in with GitHub to view your own or private repositories</p>
            <button @click="showLoginExplainer" class="github-login-btn">
              <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              Sign in with GitHub
            </button>
          </div>
          
          <form @submit.prevent="fetchWrapped" class="form">
            <div class="form-group">
              <input
                id="username"
                v-model="username"
                type="text"
                :placeholder="isAuthenticated ? 'Optional - defaults to your username' : 'GitHub username...'"
                class="input-main"
              />
            </div>

            <div class="advanced-toggle">
              <button type="button" @click="showAdvanced = !showAdvanced" class="toggle-btn">
                {{ showAdvanced ? '−' : '+' }} Options
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
              </div>
            </div>

            <button type="submit" class="submit-btn">
              Generate
            </button>
          </form>

          <div v-if="error" class="error-message fade-in">
            {{ error }}
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-section fade-in">
          <div class="loading-card">
            <div class="loading-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="loading-svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="loading-circle" />
              </svg>
            </div>
            <p class="loading-text">Reading your story...</p>
            <p class="loading-subtext">Gathering commits, PRs, and more</p>
          </div>
        </div>

        <!-- Wrapped Display -->
        <div v-if="wrappedData && !loading">
          <GitHubWrapped :data="wrappedData" @reset="reset" />
        </div>
      </div>
    </main>

    <!-- Permission Explainer Modal -->
    <PermissionExplainer
      v-if="showPermissionModal"
      @close="closePermissionModal"
      @continue="loginWithGitHub"
    />
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import GitHubWrapped from './components/GitHubWrapped.vue'
import PermissionExplainer from './components/PermissionExplainer.vue'

export default {
  name: 'App',
  components: {
    GitHubWrapped,
    PermissionExplainer
  },
  setup() {
    const username = ref('')
    const year = ref('2025')
    const showAdvanced = ref(false)
    const loading = ref(false)
    const error = ref('')
    const wrappedData = ref(null)
    const isAuthenticated = ref(false)
    const currentUser = ref(null)
    const showPermissionModal = ref(false)

    // Check authentication status on mount
    onMounted(async () => {
      await checkAuth()
      
      // Check for OAuth success in URL
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('oauth') === 'success') {
        const usernameFromOAuth = urlParams.get('username')
        if (usernameFromOAuth) {
          username.value = usernameFromOAuth
        }
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    })

    const checkAuth = async () => {
      try {
        const response = await fetch('/api/user', {
          credentials: 'include'
        })
        const data = await response.json()
        
        if (data.authenticated) {
          isAuthenticated.value = true
          currentUser.value = data.user
        } else {
          isAuthenticated.value = false
          currentUser.value = null
        }
      } catch (err) {
        console.error('Auth check failed:', err)
        isAuthenticated.value = false
      }
    }

    const showLoginExplainer = () => {
      showPermissionModal.value = true
    }

    const closePermissionModal = () => {
      showPermissionModal.value = false
    }

    const loginWithGitHub = async () => {
      showPermissionModal.value = false
      try {
        const response = await fetch('/api/oauth/login', {
          credentials: 'include'
        })
        const data = await response.json()

        if (data.authUrl) {
          // Redirect to GitHub OAuth (state is stored server-side in cookie)
          window.location.href = data.authUrl
        } else {
          error.value = data.error || 'Failed to initiate GitHub login'
        }
      } catch (err) {
        error.value = 'Failed to connect to authentication service'
      }
    }

    const logout = async () => {
      try {
        await fetch('/api/oauth/logout', {
          credentials: 'include'
        })
        isAuthenticated.value = false
        currentUser.value = null
        username.value = ''
      } catch (err) {
        console.error('Logout failed:', err)
      }
    }

    const fetchWrapped = async () => {
      // If authenticated and no username provided, use current user
      const targetUsername = username.value.trim() || (isAuthenticated.value ? currentUser.value.login : '')
      
      if (!targetUsername) {
        error.value = 'Please sign in to view your own stats or provide a username to view someone else\'s.'
        return
      }

      loading.value = true
      error.value = ''
      wrappedData.value = null

      try {
        // Build API URL
        const apiUrl = new URL('/api/wrapped', window.location.origin)
        apiUrl.searchParams.set('username', targetUsername)
        apiUrl.searchParams.set('year', year.value)

        const response = await fetch(apiUrl.toString(), {
          credentials: 'include'
        })
        
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
      error.value = ''
    }

    return {
      username,
      year,
      showAdvanced,
      loading,
      error,
      wrappedData,
      isAuthenticated,
      currentUser,
      showPermissionModal,
      fetchWrapped,
      reset,
      showLoginExplainer,
      closePermissionModal,
      loginWithGitHub,
      logout,
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

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 500px;
  margin: 0 auto var(--space-xl);
  padding: var(--space-md);
  background: var(--bg-secondary);
  border-radius: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--accent-primary);
}

.user-name {
  font-size: var(--font-body);
  color: var(--text-primary);
  font-weight: 600;
}

.logout-btn {
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: var(--font-caption);
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.form-section {
  max-width: 500px;
  margin: 0 auto;
  text-align: center;
}

.login-prompt {
  margin-bottom: var(--space-xl);
  padding: var(--space-lg);
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 2px solid var(--border);
}

.login-message {
  font-size: var(--font-body);
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.github-login-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: #24292e;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: var(--font-body);
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
}

.github-login-btn:hover {
  background: #1b1f23;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.github-login-btn svg {
  flex-shrink: 0;
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

.form-row {
  display: grid;
  grid-template-columns: 1fr;
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
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.loading-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: var(--space-xl) var(--space-xl);
  max-width: 320px;
  width: 100%;
}

.loading-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-lg);
}

.loading-svg {
  width: 100%;
  height: 100%;
  color: var(--text-secondary);
  animation: spin 1.5s linear infinite;
}

.loading-circle {
  stroke-dasharray: 50;
  stroke-dashoffset: 15;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: var(--font-body-lg);
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.loading-subtext {
  font-size: var(--font-caption);
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
