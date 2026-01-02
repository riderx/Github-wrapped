# GitHub Wrapped 🎉

A beautiful web application that creates a "Spotify Wrapped" style visualization of your GitHub activity for any year. Built with Vue.js 3 and Cloudflare Workers.

## Features

✨ **Highlights**
- 📊 View GitHub activity wrapped for any user or organization
- 🔐 GitHub OAuth login for seamless authentication
- 🔒 Support for private repositories with authenticated access
- 📅 Choose any year (defaults to 2025)
- 💾 Smart caching with Cloudflare Workers
- 🎨 Beautiful, responsive UI with animations
- 📱 Mobile-friendly design
- 🌿 Retrieves commits from default branch (main/master) only

**What You'll See:**
- Total commits, pull requests, issues, and code reviews
- Top 5 programming languages used
- Most active repositories
- Commits breakdown by branch (main/master)
- Follower/following stats
- Beautiful visualizations and stats cards

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/riderx/Github-wrapped.git
cd Github-wrapped
```

2. Install dependencies:
```bash
npm install
```

### Development

#### Option 1: Frontend and Backend Separately (Recommended for development)

Run the frontend (Vue.js) in one terminal:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

Run the backend (Cloudflare Worker) in another terminal:
```bash
npm run worker:dev
```

The worker API will be available at `http://localhost:8787`

#### Option 2: Test Full Deployment Locally (Recommended for testing)

To test the complete deployment setup locally using Wrangler (this simulates the production environment):

```bash
npm run dev:local
```

This command will:
1. Build the frontend (`npm run build`)
2. Start Wrangler development server with both the worker and static assets

The complete application (frontend + API) will be available at `http://localhost:8787`

**This is the recommended way to test before deploying to production, as it matches the actual deployment setup.**

### Usage

1. Open the app in your browser
2. (Optional) Sign in with GitHub to view your own stats or private repositories
3. Enter a GitHub username (or leave empty if signed in to see your own stats)
4. (Optional) Click "Advanced Options" to select a different year
5. Click "Generate" to see the results!

**Demo Mode:** Enter `demo` or `demouser` as the username to see a demonstration with mock data.

### GitHub Authentication

**GitHub OAuth Login (Recommended):**

The app now supports GitHub OAuth login for a seamless experience:

1. Click "Sign in with GitHub" on the main page
2. Authorize the app to access your GitHub data
3. Once authenticated, you can:
   - Leave the username field empty to see your own stats
   - View data from private repositories you have access to
   - Avoid GitHub API rate limits

**Setting up OAuth for your deployment:**

1. Create a GitHub OAuth App:
   - Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
   - Set the Homepage URL to your app's URL (e.g., `https://github-wrapped.your-subdomain.workers.dev`)
   - Set the Authorization callback URL to `https://your-app-url/api/oauth/callback`
   - Note your Client ID and Client Secret

2. Configure Cloudflare Worker environment variables:
   ```bash
   # Set the Client ID (can be in wrangler.toml or as a secret)
   wrangler secret put GITHUB_CLIENT_ID
   
   # Set the Client Secret (should always be a secret)
   wrangler secret put GITHUB_CLIENT_SECRET
   
   # Set your app URL
   wrangler secret put APP_URL
   ```

   📖 **For detailed OAuth setup instructions, see [OAUTH_SETUP.md](./OAUTH_SETUP.md)**

## Deployment

### Local Testing with Wrangler (Recommended Before Deployment)

Before deploying to production, test your changes locally with Wrangler to ensure everything works correctly:

```bash
npm run dev:local
```

This starts a local Cloudflare Workers environment at `http://localhost:8787` that serves both the frontend and API, exactly like production. Test all features including:
- Static asset serving (visit `http://localhost:8787/`)
- API endpoints (test with `http://localhost:8787/api/wrapped?username=demo`)
- SPA routing (navigate to different routes)

### Automated Deployment with GitHub Actions

This project includes automated deployment via GitHub Actions. Every push to the `main` branch automatically deploys everything as a **single Cloudflare Worker** that serves both the frontend and API.

#### How It Works

The Cloudflare Worker:
- Serves the Vue.js frontend (HTML, CSS, JS) from the `/dist` directory
- Handles API requests at `/api/wrapped`
- Uses Cloudflare Workers Sites to serve static assets
- Includes caching for optimal performance

#### Setup GitHub Actions Deployment

1. **Get your Cloudflare credentials:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to "My Profile" → "API Tokens"
   - Create a token with "Edit Cloudflare Workers" permissions
   - Note your Account ID (found in Workers & Pages overview)

2. **Add secrets to your GitHub repository:**
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
     - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
     - `G_CLIENT_ID`: Your GitHub OAuth App Client ID (required for OAuth login)
     - `G_CLIENT_SECRET`: Your GitHub OAuth App Client Secret (required for OAuth login)
     - `APP_URL`: Your deployed app URL (e.g., `https://github-wrapped.your-subdomain.workers.dev`)

   > **Note**: GitHub Actions doesn't allow secrets starting with `GITHUB_`, so OAuth secrets use `G_CLIENT_ID` and `G_CLIENT_SECRET`.

3. **Deploy:**
   - Push to `main` branch or manually trigger the workflow
   - The workflow will automatically:
     1. Build the frontend (`npm run build`)
     2. Deploy the worker with static assets
   - Check the Actions tab in GitHub for deployment status
   - Your app will be available at `https://github-wrapped.<your-subdomain>.workers.dev`

### Manual Deployment

1. Install Wrangler CLI (if not already installed):
```bash
npm install -g wrangler
# or use the local version
npx wrangler --version
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Build and deploy using the convenience script:
```bash
npm run deploy
```

Or manually:
```bash
npm run build
wrangler deploy
```

The worker will automatically include the built frontend from the `dist/` folder and serve it alongside the API.

**Troubleshooting 404 Errors:**
- Ensure the frontend is built before deploying: `npm run build`
- Check that the `dist/` folder contains `index.html` and `assets/`
- Verify `wrangler.toml` has the correct `[assets]` configuration
- Test locally first with `npm run dev:local` to verify everything works

### Configuration Details

The deployment uses Cloudflare Workers Assets (modern approach) configured in `wrangler.toml`:

```toml
[assets]
directory = "./dist"
binding = "ASSETS"
```

This configuration:
- Serves all static files from the `dist/` directory
- Provides an `ASSETS` binding to the worker for programmatic access
- Supports SPA routing (all non-API routes serve `index.html`)
- Includes automatic asset optimization and caching

## Project Structure

```
├── src/
│   ├── components/
│   │   └── GitHubWrapped.vue    # Main wrapped display component
│   ├── styles/
│   │   └── main.css             # Global styles
│   ├── App.vue                  # Root component
│   └── main.js                  # App entry point
├── worker/
│   └── index.js                 # Cloudflare Worker API
├── public/                      # Static assets
├── index.html                   # HTML template
├── vite.config.js              # Vite configuration
├── wrangler.toml               # Cloudflare Worker config
└── package.json                # Dependencies and scripts
```

## API Endpoints

### Authentication Endpoints

#### GET `/api/oauth/login`

Initiates the GitHub OAuth login flow.

**Response:**
```json
{
  "authUrl": "https://github.com/login/oauth/authorize?...",
  "state": "random_state_string"
}
```

#### GET `/api/oauth/callback`

OAuth callback endpoint. Handles the authorization code from GitHub and sets a session cookie.

**Query Parameters:**
- `code` (required): Authorization code from GitHub
- `state` (required): State parameter for CSRF protection

**Response:** Redirects to the app with authentication cookie set.

#### GET `/api/oauth/logout`

Logs out the current user by clearing the session cookie.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET `/api/user`

Gets the current authenticated user's information.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "login": "octocat",
    "name": "The Octocat",
    "avatar": "https://..."
  }
}
```

### Data Endpoints

#### GET `/api/wrapped`

Fetches GitHub wrapped data for a user.

**Query Parameters:**
- `username` (optional): GitHub username or organization (auto-detected from OAuth session if not provided)
- `year` (optional): Year to generate wrapped for (default: 2025)

**Authentication:**
- Users must authenticate via GitHub OAuth to access private repositories
- The OAuth token is stored securely in an HTTP-only session cookie

**Implementation Details:**
- **Branch Filtering**: Only retrieves commits from the default branch (main or master) of each repository
- **Rate Limiting**: Includes comprehensive rate limit tracking and informative error messages
- **Logging**: Enhanced logging for debugging operations and tracking API calls
- **Commit Data**: Collects commit messages, dates, branches, and file change statistics
- **Repository Scanning**: Fetches all repositories where the user has contributed in the past year
- **Smart Caching**: Results are cached for 1 hour to reduce API calls

**Response:**
```json
{
  "user": {
    "login": "octocat",
    "name": "The Octocat",
    "avatar": "https://...",
    "bio": "...",
    "followers": 1000,
    "following": 100,
    "publicRepos": 50
  },
  "year": 2025,
  "stats": {
    "totalCommits": 500,
    "pullRequests": 50,
    "issues": 20,
    "reviews": 30,
    "repositoriesContributed": 10,
    "topRepositories": [...],
    "topLanguages": [...],
    "commitsByBranch": {
      "main": 350,
      "master": 150,
      "other": 0
    }
  },
}
```

## Technologies Used

- **Frontend**: Vue.js 3, Vite
- **Backend**: Cloudflare Workers
- **API**: GitHub REST API v3
- **Caching**: Cloudflare Workers Cache API
- **Styling**: CSS3 with custom properties

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Credits

Made with ❤️ using Vue.js and Cloudflare Workers