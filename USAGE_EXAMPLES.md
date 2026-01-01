# GitHub Wrapped API - Enhanced Usage Examples

## Overview
The GitHub Wrapped API now supports fetching detailed commit information including file changes and code diffs. This enhancement is designed for AI-powered analysis and downstream processing.

## Basic Usage (Standard Mode)

### Request
```bash
curl "https://your-worker.workers.dev/api/wrapped?username=octocat&year=2025"
```

### Response
```json
{
  "user": { "login": "octocat", "name": "The Octocat", ... },
  "year": 2025,
  "stats": {
    "totalCommits": 500,
    "pullRequests": 50,
    "issues": 20,
    "reviews": 30,
    "repositoriesContributed": 10,
    "topRepositories": [...],
    "topLanguages": [...]
  },
  "insights": { ... }
}
```

## Enhanced Usage (Detailed Mode)

### Request with Detailed Commit Information
```bash
curl "https://your-worker.workers.dev/api/wrapped?username=octocat&year=2025&includeDetails=true"
```

### Response with Detailed Data
```json
{
  "user": { "login": "octocat", "name": "The Octocat", ... },
  "year": 2025,
  "stats": {
    "totalCommits": 500,
    "pullRequests": 50,
    "issues": 20,
    "reviews": 30,
    "repositoriesContributed": 10,
    "topRepositories": [
      {
        "name": "awesome-project",
        "fullName": "octocat/awesome-project",
        "commits": 234,
        "stars": 1250,
        "language": "JavaScript",
        "additions": 5432,
        "deletions": 2156
      }
    ],
    "topLanguages": [...],
    "totalAdditions": 15420,
    "totalDeletions": 8932,
    "totalChanges": 24352
  },
  "commits": [
    {
      "sha": "a1b2c3d4e5f6...",
      "message": "Add authentication module\n\nImplemented JWT-based authentication with refresh tokens",
      "date": "2025-03-15T10:30:00Z",
      "repo": "octocat/awesome-project",
      "author": {
        "name": "The Octocat",
        "email": "octocat@github.com"
      },
      "stats": {
        "additions": 150,
        "deletions": 45,
        "total": 195
      },
      "files": [
        {
          "filename": "src/auth/jwt.js",
          "status": "added",
          "additions": 120,
          "deletions": 0,
          "changes": 120,
          "patch": "@@ -0,0 +1,120 @@\n+const jwt = require('jsonwebtoken');\n+\n+function generateToken(user) {\n+  return jwt.sign({ id: user.id }, process.env.JWT_SECRET);\n+}\n..."
        },
        {
          "filename": "src/auth/middleware.js",
          "status": "modified",
          "additions": 30,
          "deletions": 45,
          "changes": 75,
          "patch": "@@ -10,7 +10,8 @@ function authenticate(req, res, next) {\n-  // Old authentication logic\n+  // New JWT-based authentication\n..."
        }
      ]
    }
  ],
  "insights": { ... }
}
```

## Authenticated Requests (with Personal Access Token)

### Request with Token
```bash
curl "https://your-worker.workers.dev/api/wrapped?username=octocat&year=2025&token=ghp_yourtokenhere&includeDetails=true"
```

### Benefits
- Access to private repositories
- Higher rate limits (5000 requests/hour vs 60 requests/hour)
- More comprehensive data from all owned repositories

## Use Cases for Detailed Mode

### 1. AI-Powered Code Analysis
```javascript
// Fetch detailed commits
const response = await fetch('/api/wrapped?username=octocat&year=2025&includeDetails=true');
const data = await response.json();

// Analyze code patterns
const commits = data.commits;
const jsFiles = commits.flatMap(c => c.files.filter(f => f.filename.endsWith('.js')));
const totalJsChanges = jsFiles.reduce((sum, f) => sum + f.changes, 0);

console.log(`Total JavaScript changes: ${totalJsChanges} lines`);
```

### 2. Coding Pattern Recognition
```javascript
// Identify most frequently modified files
const fileChanges = {};
data.commits.forEach(commit => {
  commit.files.forEach(file => {
    if (!fileChanges[file.filename]) {
      fileChanges[file.filename] = 0;
    }
    fileChanges[file.filename] += file.changes;
  });
});

const topFiles = Object.entries(fileChanges)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10);

console.log('Most modified files:', topFiles);
```

### 3. Development Velocity Analysis
```javascript
// Calculate average commit size
const avgAdditions = data.stats.totalAdditions / data.stats.totalCommits;
const avgDeletions = data.stats.totalDeletions / data.stats.totalCommits;

console.log(`Average additions per commit: ${avgAdditions.toFixed(1)}`);
console.log(`Average deletions per commit: ${avgDeletions.toFixed(1)}`);

// Identify refactoring patterns
const refactoringCommits = data.commits.filter(c => {
  return c.stats.deletions > c.stats.additions * 0.5;
});

console.log(`Refactoring commits: ${refactoringCommits.length}`);
```

### 4. Language Distribution Deep Dive
```javascript
// Analyze actual code changes by language
const languageChanges = {};

data.commits.forEach(commit => {
  commit.files.forEach(file => {
    const ext = file.filename.split('.').pop();
    if (!languageChanges[ext]) {
      languageChanges[ext] = { additions: 0, deletions: 0 };
    }
    languageChanges[ext].additions += file.additions;
    languageChanges[ext].deletions += file.deletions;
  });
});

console.log('Code changes by file type:', languageChanges);
```

## Rate Limiting Considerations

### Unauthenticated Requests
- 60 requests per hour per IP address
- Detailed mode makes 1 additional request per commit (up to 50 commits per repo)
- Best for small-scale analysis

### Authenticated Requests (Recommended)
- 5000 requests per hour
- Suitable for comprehensive analysis
- Access to private repositories

### Built-in Protection
- Automatic 100ms delay between detailed commit fetches
- Respects GitHub API rate limit headers
- Graceful error handling on rate limit exceeded
- Separate caching for detailed vs basic requests

## Performance Tips

1. **Use caching**: Responses are cached for 1 hour
2. **Be selective**: Only use `includeDetails=true` when you need the extra data
3. **Use tokens**: Authenticated requests have higher rate limits
4. **Monitor rate limits**: Check `X-RateLimit-Remaining` header in responses
5. **Batch processing**: For multiple users, space out requests to avoid rate limiting

## Example: Full AI Analysis Pipeline

```javascript
async function analyzeGitHubYear(username, year, token) {
  // Step 1: Fetch detailed data
  const response = await fetch(
    `/api/wrapped?username=${username}&year=${year}&token=${token}&includeDetails=true`
  );
  const data = await response.json();
  
  // Step 2: Extract meaningful insights
  const insights = {
    productivity: data.stats.totalCommits,
    codeVelocity: data.stats.totalChanges,
    refactoringRatio: data.stats.totalDeletions / data.stats.totalAdditions,
    topLanguages: data.stats.topLanguages.map(l => l.language),
    topProjects: data.stats.topRepositories.map(r => r.name),
  };
  
  // Step 3: Analyze commit patterns
  const commitPatterns = {
    averageMessageLength: data.commits.reduce((sum, c) => sum + c.message.length, 0) / data.commits.length,
    hasDescriptions: data.commits.filter(c => c.message.includes('\n')).length,
    conventionalCommits: data.commits.filter(c => /^(feat|fix|docs|style|refactor|test|chore):/.test(c.message)).length,
  };
  
  // Step 4: File change analysis
  const fileStats = {};
  data.commits.forEach(commit => {
    commit.files.forEach(file => {
      const ext = file.filename.split('.').pop();
      if (!fileStats[ext]) {
        fileStats[ext] = { count: 0, additions: 0, deletions: 0 };
      }
      fileStats[ext].count++;
      fileStats[ext].additions += file.additions;
      fileStats[ext].deletions += file.deletions;
    });
  });
  
  return {
    insights,
    commitPatterns,
    fileStats,
    rawData: data
  };
}

// Usage
analyzeGitHubYear('octocat', '2025', 'ghp_yourtoken').then(analysis => {
  console.log('Complete Analysis:', analysis);
});
```

## Conclusion

The enhanced GitHub Wrapped API provides comprehensive data for AI-powered analysis, code evolution tracking, and developer insights. Use the `includeDetails` parameter judiciously to balance between data richness and API efficiency.
