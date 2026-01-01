/**
 * Cloudflare Worker for GitHub Wrapped API
 * Handles GitHub API requests with caching support
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Cache TTL: 1 hour
const CACHE_TTL = 3600;

// API limits to avoid rate limiting
const MAX_REPO_PAGES = 10; // Maximum number of pages to fetch (100 repos per page)
const MAX_REPOS_TO_CHECK = 20; // Maximum number of repos to check for commits
const TOP_REPOS_TO_SHOW = 5; // Number of top repositories to display

/**
 * Fetch GitHub API with authentication
 */
async function fetchGitHub(url, token = null) {
  const headers = {
    'User-Agent': 'GitHub-Wrapped',
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded. Please provide an API token or try again later.');
      }
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get user information
 */
async function getUserInfo(username, token) {
  return fetchGitHub(`https://api.github.com/users/${username}`, token);
}

/**
 * Get user's repositories
 */
async function getUserRepos(username, token) {
  const repos = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore && page <= MAX_REPO_PAGES) {
    const data = await fetchGitHub(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&sort=updated`,
      token
    );
    
    if (data.length === 0) {
      hasMore = false;
    } else {
      repos.push(...data);
      page++;
    }
  }
  
  return repos;
}

/**
 * Get commits for a repository in a specific year with messages
 */
async function getRepoCommits(owner, repo, username, year, token) {
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;
  
  try {
    // Fetch commits with details
    const commits = await fetchGitHub(
      `https://api.github.com/repos/${owner}/${repo}/commits?author=${username}&since=${since}&until=${until}&per_page=100`,
      token
    );
    
    // Return commits with message and date
    return commits.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      date: commit.commit.author.date,
      repo: `${owner}/${repo}`
    }));
  } catch (error) {
    console.error(`Error fetching commits for ${owner}/${repo}:`, error);
    return [];
  }
}

/**
 * Get user's events (for activity tracking)
 */
async function getUserEvents(username, token) {
  try {
    const events = await fetchGitHub(
      `https://api.github.com/users/${username}/events?per_page=100`,
      token
    );
    return events;
  } catch (error) {
    console.error(`Error fetching events for ${username}:`, error);
    return [];
  }
}

/**
 * Analyze commit messages using AI to extract meaningful insights
 */
async function analyzeCommitsWithAI(allCommits, env) {
  if (!allCommits || allCommits.length === 0) {
    return null;
  }
  
  // Prepare commit data for AI analysis
  const commitSample = allCommits.slice(0, 200); // Analyze up to 200 commits
  const commitText = commitSample.map((c, i) => 
    `${i + 1}. [${c.repo}] ${c.message.split('\n')[0]}`
  ).join('\n');
  
  const prompt = `Analyze these GitHub commits from a developer's year and provide deep, insightful observations:

${commitText}

Based on these commits, provide a detailed analysis in JSON format with these sections:

1. "story": A 2-3 sentence narrative about this developer's year - what was their journey?
2. "mainTheme": One sentence describing the overarching theme of their work
3. "biggestStruggles": Array of 2-3 specific challenges they faced (with evidence from commit messages)
4. "proudMoments": Array of 2-3 achievements or breakthroughs (with evidence)
5. "workStyle": Object describing their development style:
   - "pace": "steady", "burst", or "sprint"
   - "approach": "perfectionist", "pragmatic", "experimental", etc.
   - "description": 1 sentence description
6. "topicsExplored": Array of 3-5 technical topics/technologies they worked on
7. "evolutionInsight": How did their work evolve through the year?
8. "funFact": One interesting, specific observation about their commit patterns

Return only valid JSON, no other text.`;

  try {
    // Use Cloudflare Workers AI for analysis
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are an expert at analyzing developer activity and providing meaningful insights. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500
    });
    
    // Parse AI response
    let aiInsights;
    try {
      const responseText = response.response || JSON.stringify(response);
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiInsights = JSON.parse(jsonMatch[0]);
      } else {
        aiInsights = JSON.parse(responseText);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      return null;
    }
    
    return aiInsights;
  } catch (error) {
    console.error('AI analysis failed:', error);
    return null;
  }
}

/**
 * Analyze commit messages to extract insights (fallback method)
 */
function analyzeCommitMessages(allCommits) {
  const insights = {
    themes: [],
    struggles: [],
    quickWins: [],
    majorFeatures: [],
    commitPatterns: {},
    workingStyle: {}
  };
  
  // Keywords for different categories
  const struggleKeywords = ['fix', 'bug', 'issue', 'error', 'problem', 'broken', 'failing', 'debug', 'revert', 'hotfix', 'patch', 'workaround'];
  const featureKeywords = ['add', 'implement', 'create', 'new', 'feature', 'support', 'enable'];
  const refactorKeywords = ['refactor', 'cleanup', 'improve', 'optimize', 'reorganize', 'simplify', 'restructure'];
  const docsKeywords = ['doc', 'readme', 'comment', 'documentation'];
  const testKeywords = ['test', 'spec', 'coverage'];
  
  // Analyze each commit
  const commitsByType = {
    fixes: [],
    features: [],
    refactors: [],
    docs: [],
    tests: [],
    other: []
  };
  
  const commitsByLength = {
    quick: [],  // Small commits
    substantial: []  // Larger, detailed commits
  };
  
  allCommits.forEach(commit => {
    const msg = commit.message.toLowerCase();
    const lines = commit.message.split('\n');
    const firstLine = lines[0];
    
    // Categorize by type
    if (struggleKeywords.some(kw => msg.includes(kw))) {
      commitsByType.fixes.push({ ...commit, firstLine });
    } else if (featureKeywords.some(kw => msg.includes(kw))) {
      commitsByType.features.push({ ...commit, firstLine });
    } else if (refactorKeywords.some(kw => msg.includes(kw))) {
      commitsByType.refactors.push({ ...commit, firstLine });
    } else if (docsKeywords.some(kw => msg.includes(kw))) {
      commitsByType.docs.push({ ...commit, firstLine });
    } else if (testKeywords.some(kw => msg.includes(kw))) {
      commitsByType.tests.push({ ...commit, firstLine });
    } else {
      commitsByType.other.push({ ...commit, firstLine });
    }
    
    // Categorize by commit message detail
    if (lines.length > 2 || commit.message.length > 100) {
      commitsByLength.substantial.push({ ...commit, firstLine });
    } else {
      commitsByLength.quick.push({ ...commit, firstLine });
    }
  });
  
  // Generate insights
  const totalCommits = allCommits.length;
  
  // Themes - what dominated the year
  const themes = [];
  if (commitsByType.features.length / totalCommits > 0.3) {
    themes.push({
      title: 'The Builder',
      description: `You were in creation mode! ${commitsByType.features.length} commits focused on building new features and capabilities.`,
      icon: '🏗️'
    });
  }
  
  if (commitsByType.fixes.length / totalCommits > 0.25) {
    themes.push({
      title: 'The Problem Solver',
      description: `${commitsByType.fixes.length} commits dedicated to fixing issues and debugging. You fought through the tough problems!`,
      icon: '🔧'
    });
  }
  
  if (commitsByType.refactors.length / totalCommits > 0.15) {
    themes.push({
      title: 'The Perfectionist',
      description: `${commitsByType.refactors.length} commits improving and refactoring code. Quality matters to you!`,
      icon: '✨'
    });
  }
  
  if (commitsByType.tests.length / totalCommits > 0.1) {
    themes.push({
      title: 'The Quality Guardian',
      description: `${commitsByType.tests.length} commits adding tests. You believe in robust, tested code!`,
      icon: '🛡️'
    });
  }
  
  // Struggles - commits that show challenges
  const struggles = commitsByType.fixes
    .filter(c => {
      const msg = c.message.toLowerCase();
      return msg.includes('finally') || msg.includes('fixed') || msg.includes('resolved') || 
             msg.includes('workaround') || msg.includes('attempt') || msg.includes('try');
    })
    .slice(0, 5)
    .map(c => ({
      message: c.firstLine,
      repo: c.repo,
      date: c.date
    }));
  
  // Quick wins - short, impactful commits
  const quickWins = commitsByLength.quick
    .filter(c => commitsByType.features.includes(c))
    .slice(0, 5)
    .map(c => ({
      message: c.firstLine,
      repo: c.repo,
      date: c.date
    }));
  
  // Major features - detailed commits about new features
  const majorFeatures = commitsByLength.substantial
    .filter(c => commitsByType.features.includes(c))
    .slice(0, 5)
    .map(c => ({
      message: c.firstLine,
      repo: c.repo,
      date: c.date,
      details: c.message.split('\n').slice(1).join('\n').trim()
    }));
  
  // Working style
  const workingStyle = {
    commitFrequency: totalCommits > 500 ? 'Very Active' : totalCommits > 200 ? 'Active' : 'Steady',
    detailLevel: commitsByLength.substantial.length / totalCommits > 0.3 ? 'Detailed' : 'Concise',
    focusArea: Object.entries(commitsByType)
      .sort(([, a], [, b]) => b.length - a.length)[0][0]
  };
  
  // Most active months
  const monthlyCommits = {};
  allCommits.forEach(commit => {
    const month = new Date(commit.date).toLocaleString('default', { month: 'long' });
    monthlyCommits[month] = (monthlyCommits[month] || 0) + 1;
  });
  
  const topMonths = Object.entries(monthlyCommits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([month, count]) => ({ month, commits: count }));
  
  // Generate story and main theme
  const story = themes.length > 0 
    ? `This year, you were ${themes[0].title.toLowerCase()}. ${themes[0].description}`
    : `This year, you made ${totalCommits} commits, building and refining your craft through consistent work.`;
  
  const mainTheme = themes.length > 0
    ? themes[0].description
    : "Steady progress through dedication and focus";
  
  // Format struggles for UI
  const biggestStruggles = struggles.slice(0, 3).map(s => s.message || "Debugging complex issues and finding solutions");
  
  // Format proud moments from features
  const proudMoments = majorFeatures.slice(0, 3).map(m => m.message || "Shipped meaningful features");
  
  // Topics from commit keywords
  const topicsExplored = [];
  if (commitsByType.features.length > 0) topicsExplored.push("Feature Development");
  if (commitsByType.fixes.length > 0) topicsExplored.push("Bug Fixing");
  if (commitsByType.refactors.length > 0) topicsExplored.push("Code Refactoring");
  if (commitsByType.tests.length > 0) topicsExplored.push("Testing");
  if (commitsByType.docs.length > 0) topicsExplored.push("Documentation");
  
  // Fun fact from monthly data
  const funFact = topMonths.length > 0
    ? `Your most productive month was ${topMonths[0].month} with ${topMonths[0].commits} commits!`
    : `You maintained a ${workingStyle.commitFrequency.toLowerCase()} pace throughout the year.`;
  
  // Evolution insight
  const evolutionInsight = commitsByLength.substantial.length > commitsByLength.quick.length
    ? "You evolved toward more detailed, thoughtful commits as the year progressed."
    : "You maintained a consistent, efficient commit style throughout the year.";
  
  return {
    story,
    mainTheme,
    biggestStruggles: biggestStruggles.length > 0 ? biggestStruggles : ["Navigating challenges and finding solutions"],
    proudMoments: proudMoments.length > 0 ? proudMoments : ["Making progress and shipping code"],
    workStyle: {
      pace: workingStyle.commitFrequency.toLowerCase().replace(' ', '-'),
      approach: workingStyle.detailLevel.toLowerCase(),
      description: `You're a ${workingStyle.detailLevel.toLowerCase()} developer with a ${workingStyle.commitFrequency.toLowerCase()} pace.`
    },
    topicsExplored: topicsExplored.length > 0 ? topicsExplored : ["Software Development"],
    evolutionInsight,
    funFact
  };
}

/**
 * Aggregate GitHub statistics for the wrapped
 */
async function generateWrapped(username, year, token, env) {
  // Get user info
  const userInfo = await getUserInfo(username, token);
  
  // Get repositories (limit to recent ones)
  const repos = await getUserRepos(username, token);
  
  // Filter repos updated in the target year and limit to avoid rate limits
  const targetYear = parseInt(year);
  const filteredRepos = repos
    .filter(repo => {
      const updatedYear = new Date(repo.updated_at).getFullYear();
      return updatedYear >= targetYear - 1; // Include previous year to catch early commits
    })
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, MAX_REPOS_TO_CHECK);
  
  // Collect all commits for analysis
  let allCommits = [];
  let totalCommits = 0;
  let languageStats = {};
  let repoContributions = [];
  
  for (const repo of filteredRepos) {
    // Get commits for this repo
    const commits = await getRepoCommits(repo.owner.login, repo.name, username, year, token);
    
    if (commits.length > 0) {
      totalCommits += commits.length;
      allCommits = allCommits.concat(commits); // Collect all commits for AI analysis
      
      repoContributions.push({
        name: repo.name,
        fullName: repo.full_name,
        commits: commits.length,
        stars: repo.stargazers_count,
        language: repo.language,
      });
      
      // Track language usage
      if (repo.language) {
        languageStats[repo.language] = (languageStats[repo.language] || 0) + commits.length;
      }
    }
  }
  
  // Sort repos by commits
  repoContributions.sort((a, b) => b.commits - a.commits);
  
  // Get top languages
  const topLanguages = Object.entries(languageStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([language, commits]) => ({ language, commits }));
  
  // Get recent events for additional stats
  const events = await getUserEvents(username, token);
  const yearEvents = events.filter(event => {
    const eventDate = new Date(event.created_at);
    return eventDate.getFullYear() === parseInt(year);
  });
  
  const pullRequests = yearEvents.filter(e => e.type === 'PullRequestEvent').length;
  const issues = yearEvents.filter(e => e.type === 'IssuesEvent').length;
  const reviews = yearEvents.filter(e => e.type === 'PullRequestReviewEvent').length;
  
  // Generate AI insights from commits
  let insights = null;
  if (allCommits.length > 0) {
    try {
      // Try AI analysis if env.AI is available
      if (env && env.AI) {
        insights = await analyzeCommitsWithAI(allCommits, env);
      }
      
      // Fallback to rule-based analysis if AI fails or unavailable
      if (!insights) {
        insights = analyzeCommitMessages(allCommits);
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      // Use fallback analysis
      insights = analyzeCommitMessages(allCommits);
    }
  }
  
  return {
    user: {
      login: userInfo.login,
      name: userInfo.name,
      avatar: userInfo.avatar_url,
      bio: userInfo.bio,
      location: userInfo.location,
      publicRepos: userInfo.public_repos,
      followers: userInfo.followers,
      following: userInfo.following,
    },
    year: parseInt(year),
    stats: {
      totalCommits,
      pullRequests,
      issues,
      reviews,
      repositoriesContributed: repoContributions.length,
      topRepositories: repoContributions.slice(0, TOP_REPOS_TO_SHOW),
      topLanguages,
    },
    insights,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Handle incoming requests
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Parse path
  const path = url.pathname;
  
  // API routes
  if (path === '/api/wrapped') {
    // Get query parameters
    const username = url.searchParams.get('username');
    const year = url.searchParams.get('year') || '2025';
    const token = url.searchParams.get('token') || null;
    
    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Demo mode for testing
    if (username.toLowerCase() === 'demo' || username.toLowerCase() === 'demouser') {
      const demoData = {
        user: {
          login: 'demouser',
          name: 'Demo User',
          avatar: 'https://avatars.githubusercontent.com/u/583231?v=4',
          bio: 'This is a demo account to showcase GitHub Wrapped',
          location: 'San Francisco, CA',
          publicRepos: 42,
          followers: 1234,
          following: 567,
        },
        year: parseInt(year),
        stats: {
          totalCommits: 847,
          pullRequests: 152,
          issues: 43,
          reviews: 89,
          repositoriesContributed: 15,
          topRepositories: [
            { name: 'awesome-project', fullName: 'demouser/awesome-project', commits: 234, stars: 1250, language: 'JavaScript' },
            { name: 'react-dashboard', fullName: 'demouser/react-dashboard', commits: 189, stars: 892, language: 'TypeScript' },
            { name: 'python-api', fullName: 'demouser/python-api', commits: 156, stars: 445, language: 'Python' },
          ],
          topLanguages: [
            { language: 'JavaScript', commits: 312 },
            { language: 'TypeScript', commits: 245 },
            { language: 'Python', commits: 178 },
          ],
        },
        insights: {
          story: "This year, you transformed from a JavaScript enthusiast into a full-stack powerhouse. You tackled ambitious projects, conquered tricky bugs, and shipped features that users loved.",
          mainTheme: "Building with purpose, one commit at a time",
          biggestStruggles: [
            "Wrestling with TypeScript types in the react-dashboard refactor - but you emerged victorious with cleaner, safer code",
            "Debugging the authentication flow that took 3 days and 47 commits, teaching you patience and systematic problem-solving",
            "Migrating the Python API to async/await, a challenge that ultimately made you a better async programmer"
          ],
          proudMoments: [
            "Shipped the awesome-project to production with 1,250 stars - users actually love what you built!",
            "That one-line fix that resolved 3 different bugs - sometimes simplicity is genius",
            "Mentoring 5 junior developers through code reviews, sharing knowledge and growing the community"
          ],
          workStyle: {
            pace: "steady",
            approach: "pragmatic",
            description: "You're a thoughtful builder who values quality over speed, shipping reliable code consistently throughout the year."
          },
          topicsExplored: [
            "React Performance Optimization",
            "TypeScript Advanced Patterns",
            "Python Async Programming",
            "API Design Best Practices",
            "Test-Driven Development"
          ],
          evolutionInsight: "You started the year building features quickly, then shifted mid-year to focus on code quality and architecture. By year's end, you found the perfect balance between speed and craftsmanship.",
          funFact: "Your most productive month was July with 156 commits - seems like summer coding suits you! ☀️"
        },
        generatedAt: new Date().toISOString(),
      };
      
      return new Response(JSON.stringify(demoData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }
    
    // Create cache key
    const cacheKey = `wrapped:${username}:${year}${token ? ':private' : ''}`;
    
    // Try to get from cache
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cache_key', cacheKey);
    
    let response = await cache.match(cacheUrl);
    
    if (!response) {
      try {
        // Generate wrapped data with AI analysis
        const wrappedData = await generateWrapped(username, year, token, env);
        
        // Create response
        response = new Response(JSON.stringify(wrappedData), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
          },
        });
        
        // Store in cache
        ctx.waitUntil(cache.put(cacheUrl, response.clone()));
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    return response;
  }
  
  // Serve static assets from ASSETS binding (Cloudflare Workers Assets)
  try {
    // Try to get the asset from ASSETS
    const response = await env.ASSETS.fetch(request);
    
    // If the response is a 404 and not an API route, serve index.html for SPA routing
    if (response.status === 404 && !path.startsWith('/api')) {
      // Create a new request for index.html
      const indexUrl = new URL(request.url);
      indexUrl.pathname = '/index.html';
      return await env.ASSETS.fetch(new Request(indexUrl, request));
    }
    
    return response;
  } catch (e) {
    // Fallback: try to serve index.html for SPA routing
    if (!path.startsWith('/api')) {
      try {
        const indexUrl = new URL(request.url);
        indexUrl.pathname = '/index.html';
        return await env.ASSETS.fetch(new Request(indexUrl, request));
      } catch (indexError) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    }
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
}

export default {
  fetch: handleRequest,
};
