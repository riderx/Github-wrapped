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

/**
 * Fetch GitHub API with authentication
 */
async function fetchGitHub(url, token = null) {
  const headers = {
    'User-Agent': 'GitHub-Wrapped',
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
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
  
  while (hasMore && page <= 10) { // Limit to 10 pages (1000 repos)
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
 * Get commits for a repository in a specific year
 */
async function getRepoCommits(owner, repo, username, year, token) {
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;
  
  try {
    // Only check first page to reduce API calls
    const commits = await fetchGitHub(
      `https://api.github.com/repos/${owner}/${repo}/commits?author=${username}&since=${since}&until=${until}&per_page=30`,
      token
    );
    return commits;
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
 * Aggregate GitHub statistics for the wrapped
 */
async function generateWrapped(username, year, token) {
  // Get user info
  const userInfo = await getUserInfo(username, token);
  
  // Get repositories (limit to recent ones)
  const repos = await getUserRepos(username, token);
  
  // Filter repos updated in the target year and limit to top 20 by stars
  const targetYear = parseInt(year);
  const filteredRepos = repos
    .filter(repo => {
      const updatedYear = new Date(repo.updated_at).getFullYear();
      return updatedYear >= targetYear - 1; // Include previous year to catch early commits
    })
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 20); // Limit to 20 repos to avoid rate limits
  
  // Filter repos and get commits for the specified year
  let totalCommits = 0;
  let languageStats = {};
  let repoContributions = [];
  
  for (const repo of filteredRepos) {
    // Get commits for this repo
    const commits = await getRepoCommits(repo.owner.login, repo.name, username, year, token);
    
    if (commits.length > 0) {
      totalCommits += commits.length;
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
      topRepositories: repoContributions.slice(0, 5),
      topLanguages,
    },
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
            { name: 'mobile-app', fullName: 'demouser/mobile-app', commits: 98, stars: 321, language: 'Dart' },
            { name: 'rust-cli', fullName: 'demouser/rust-cli', commits: 87, stars: 234, language: 'Rust' },
          ],
          topLanguages: [
            { language: 'JavaScript', commits: 312 },
            { language: 'TypeScript', commits: 245 },
            { language: 'Python', commits: 178 },
            { language: 'Rust', commits: 87 },
            { language: 'Go', commits: 25 },
          ],
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
        // Generate wrapped data
        const wrappedData = await generateWrapped(username, year, token);
        
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
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

export default {
  fetch: handleRequest,
};
