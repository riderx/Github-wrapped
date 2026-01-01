# GitHub Wrapped 🎉

A beautiful web application that creates a "Spotify Wrapped" style visualization of your GitHub activity for any year. Built with Vue.js 3 and Cloudflare Workers.

## Features

✨ **Highlights**
- 📊 View GitHub activity wrapped for any user or organization
- 🔒 Support for private repositories with API token
- 📅 Choose any year (defaults to 2025)
- 💾 Smart caching with Cloudflare Workers
- 🎨 Beautiful, responsive UI with animations
- 📱 Mobile-friendly design

**What You'll See:**
- Total commits, pull requests, issues, and code reviews
- Top 5 programming languages used
- Most active repositories
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

Run the frontend (Vue.js):
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

Run the backend (Cloudflare Worker) in development mode:
```bash
npm run worker:dev
```

The worker API will be available at `http://localhost:8787`

### Usage

1. Open the app in your browser
2. Enter a GitHub username or organization name
3. (Optional) Click "Advanced Options" to:
   - Select a different year
   - Add a GitHub API token for private repository access
4. Click "Generate Wrapped" to see the results!

**Demo Mode:** Enter `demo` or `demouser` as the username to see a demonstration with mock data.

### GitHub API Token

To view private repository data, you'll need a GitHub Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with `repo` scope
3. Copy the token and paste it in the "API Token" field (in Advanced Options)

**Note:** The token is never stored and only used for API requests.

## Deployment

### Deploy to Cloudflare Workers

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Deploy the worker:
```bash
npm run worker:deploy
```

4. Update the API endpoint in your frontend to use the deployed worker URL

### Deploy Frontend

The frontend can be deployed to any static hosting service:
- **Cloudflare Pages**: Connect your GitHub repo and deploy automatically
- **Vercel**: Import your GitHub repo and deploy
- **Netlify**: Connect your GitHub repo and deploy
- **GitHub Pages**: Use GitHub Actions to build and deploy

Build the frontend:
```bash
npm run build
```

The built files will be in the `dist/` directory.

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

### GET `/api/wrapped`

Fetches GitHub wrapped data for a user.

**Query Parameters:**
- `username` (required): GitHub username or organization
- `year` (optional): Year to generate wrapped for (default: 2025)
- `token` (optional): GitHub API token for private repo access

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
    "topLanguages": [...]
  }
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