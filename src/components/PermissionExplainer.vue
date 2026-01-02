<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content fade-in">
      <button class="close-btn" @click="$emit('close')" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div class="modal-header">
        <div class="icon-container">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h2>Why we need repository access</h2>
      </div>

      <div class="modal-body">
        <p class="intro">
          We know the permissions look scary. Here's exactly what we do and why:
        </p>

        <div class="explanation-list">
          <div class="explanation-item">
            <div class="item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <div class="item-content">
              <h3>Why repo access?</h3>
              <p>GitHub's API is too slow to fetch your commit history in real-time. We clone your repositories directly using Git to read commits instantly.</p>
            </div>
          </div>

          <div class="explanation-item">
            <div class="item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div class="item-content">
              <h3>What we read</h3>
              <p>Only commit metadata (dates, messages, file changes). We don't read your actual source code or any sensitive data.</p>
            </div>
          </div>

          <div class="explanation-item">
            <div class="item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div class="item-content">
              <h3>Nothing is saved</h3>
              <p>Everything runs in a serverless function that terminates immediately after your request. No data is stored, logged, or extracted.</p>
            </div>
          </div>

          <div class="explanation-item">
            <div class="item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
              </svg>
            </div>
            <div class="item-content">
              <h3>Verify it yourself</h3>
              <p>
                This project is fully open source.
                <a href="https://github.com/riderx/github-wrapped" target="_blank" rel="noopener noreferrer">Check the code on GitHub</a>
              </p>
            </div>
          </div>
        </div>

        <div class="org-tip">
          <div class="tip-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p>
            <strong>Tip:</strong> When authorizing, make sure to grant access to any organizations whose repositories you want analyzed.
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button @click="$emit('close')" class="btn-secondary">
          Cancel
        </button>
        <button @click="$emit('continue')" class="btn-primary">
          Continue to GitHub
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PermissionExplainer',
  emits: ['close', 'continue']
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-md);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: 16px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  border: 1px solid var(--border);
}

.close-btn {
  position: absolute;
  top: var(--space-md);
  right: var(--space-md);
  background: transparent;
  color: var(--text-secondary);
  padding: var(--space-sm);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.modal-header {
  padding: var(--space-lg);
  padding-bottom: var(--space-md);
  text-align: center;
}

.icon-container {
  width: 56px;
  height: 56px;
  background: rgba(29, 185, 84, 0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-md);
  color: var(--accent-primary);
}

.modal-header h2 {
  font-size: var(--font-subheading);
  font-weight: 700;
  color: var(--text-primary);
}

.modal-body {
  padding: 0 var(--space-lg) var(--space-lg);
}

.intro {
  color: var(--text-secondary);
  font-size: var(--font-body);
  margin-bottom: var(--space-lg);
  text-align: center;
}

.explanation-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.explanation-item {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg-elevated);
  border-radius: 12px;
}

.item-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
}

.item-content h3 {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
}

.item-content p {
  font-size: var(--font-caption);
  color: var(--text-secondary);
  line-height: 1.5;
}

.item-content a {
  color: var(--accent-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.item-content a:hover {
  text-decoration: none;
}

.org-tip {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.2);
  border-radius: 12px;
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
}

.tip-icon {
  flex-shrink: 0;
  color: var(--accent-warning);
}

.org-tip p {
  font-size: var(--font-caption);
  color: var(--text-secondary);
  line-height: 1.5;
}

.org-tip strong {
  color: var(--accent-warning);
}

.modal-footer {
  padding: var(--space-lg);
  padding-top: 0;
  display: flex;
  gap: var(--space-md);
  justify-content: flex-end;
}

.btn-secondary {
  padding: var(--space-sm) var(--space-lg);
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: var(--font-body);
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.btn-primary {
  padding: var(--space-sm) var(--space-lg);
  background: var(--accent-primary);
  color: var(--bg-primary);
  border-radius: 8px;
  font-size: var(--font-body);
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(29, 185, 84, 0.3);
}

@media (max-width: 480px) {
  .modal-content {
    max-height: 100vh;
    border-radius: 16px 16px 0 0;
    margin-top: auto;
  }

  .modal-footer {
    flex-direction: column;
  }

  .btn-secondary,
  .btn-primary {
    width: 100%;
    justify-content: center;
    padding: var(--space-md);
  }
}
</style>
