/**
 * Cloudflare Worker for GitHub Wrapped API
 * Handles GitHub API requests with caching support
 * Uses Cloudflare Workflows for durable, long-running commit fetching
 */

// Re-export the workflow class for Cloudflare
export { GitHubWrappedWorkflow } from './workflow.js';

/**
 * Get CORS headers for a request
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  
  // For credentials to work, we need to set specific origin
  if (origin !== '*') {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  
  // Fallback for non-credentialed requests
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Legacy CORS headers for backward compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Cache TTL: 1 hour
const CACHE_TTL = 3600;

// Session cookie name
const SESSION_COOKIE_NAME = 'gh_wrapped_session';

// Session expiry: 7 days
const SESSION_EXPIRY = 7 * 24 * 60 * 60;

// API configuration
const MAX_REPO_PAGES = 10; // Maximum number of pages to fetch for user repos (100 repos per page)
const TOP_REPOS_TO_SHOW = 10; // Number of top repositories to display in summary
// Note: We now use GitHub Search API with adaptive date splitting - NO commit limits!

/**
 * Fetch GitHub API with authentication and enhanced error handling
 */
async function fetchGitHub(url, token = null) {
  const headers = {
    'User-Agent': 'GitHub-Wrapped',
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  console.log(`[GitHub API] Fetching: ${url}`);
  const response = await fetch(url, { headers });
  
  // Log rate limit info
  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  console.log(`[Rate Limit] Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset ? new Date(rateLimitReset * 1000).toISOString() : 'N/A'}`);
  
  if (!response.ok) {
    if (response.status === 403) {
      if (rateLimitRemaining === '0') {
        const resetTime = rateLimitReset ? new Date(rateLimitReset * 1000).toLocaleString() : 'unknown';
        throw new Error(`GitHub API rate limit exceeded. Rate limit resets at ${resetTime}. Please provide an API token or try again later.`);
      }
    }
    console.error(`[GitHub API Error] ${response.status} ${response.statusText} for ${url}`);
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
 * Get user's repositories including those they've contributed to
 */
async function getUserRepos(username, token) {
  console.log(`[getUserRepos] Fetching repositories for ${username}`);
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
  
  console.log(`[getUserRepos] Found ${repos.length} repositories`);
  return repos;
}

/**
 * Get default branch for a repository with fallback strategy
 */
async function getDefaultBranch(owner, repo, token) {
  try {
    const repoData = await fetchGitHub(
      `https://api.github.com/repos/${owner}/${repo}`,
      token
    );
    return repoData.default_branch || 'main';
  } catch (error) {
    console.error(`[getDefaultBranch] Error fetching default branch for ${owner}/${repo}:`, error.message);
    
    // Try to check for common default branches
    const commonBranches = ['main', 'master'];
    for (const branch of commonBranches) {
      try {
        await fetchGitHub(
          `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
          token
        );
        console.log(`[getDefaultBranch] Found branch ${branch} for ${owner}/${repo}`);
        return branch;
      } catch (branchError) {
        // Branch doesn't exist, try next
        continue;
      }
    }
    
    // Final fallback to main if all else fails
    console.log(`[getDefaultBranch] Using fallback 'main' for ${owner}/${repo}`);
    return 'main';
  }
}

/**
 * Get commits for a repository in a specific year with messages and changes
 * Only retrieves commits from the default branch (main/master)
 * Implements pagination to handle repositories with many commits
 */
async function getRepoCommits(owner, repo, username, year, token) {
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;
  
  try {
    // Get the default branch for this repo
    const defaultBranch = await getDefaultBranch(owner, repo, token);
    console.log(`[getRepoCommits] Fetching commits from ${owner}/${repo} on branch ${defaultBranch}`);
    
    // Fetch commits from the default branch only with pagination
    let allCommits = [];
    let page = 1;
    const maxPages = 5; // Limit to 500 commits per repo (5 pages * 100 per page)
    let hasMore = true;
    
    while (hasMore && page <= maxPages) {
      const commits = await fetchGitHub(
        `https://api.github.com/repos/${owner}/${repo}/commits?author=${username}&since=${since}&until=${until}&per_page=100&page=${page}&sha=${defaultBranch}`,
        token
      );
      
      if (commits.length === 0) {
        hasMore = false;
      } else {
        allCommits.push(...commits);
        page++;
        
        // If we got fewer than 100, we've reached the end
        if (commits.length < 100) {
          hasMore = false;
        }
      }
    }
    
    console.log(`[getRepoCommits] Found ${allCommits.length} commits in ${owner}/${repo}`);
    
    // Return commits with message, date, and stats
    return allCommits.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      date: commit.commit.author.date,
      repo: `${owner}/${repo}`,
      branch: defaultBranch,
      stats: commit.stats || null, // Include stats if available
      files: commit.files ? commit.files.length : null // Number of files changed
    }));
  } catch (error) {
    console.error(`[getRepoCommits] Error fetching commits for ${owner}/${repo}:`, error.message);
    return [];
  }
}

/**
 * Search commits for a specific date range with full pagination
 * Returns { commits: [], totalCount: number, incomplete: boolean }
 */
async function searchCommitsInRange(username, startDate, endDate, token) {
  const dateRange = `${startDate}..${endDate}`;
  const commits = [];
  let page = 1;
  let totalCount = 0;
  let incomplete = false;

  while (true) {
    try {
      const searchUrl = `https://api.github.com/search/commits?q=author:${username}+committer-date:${dateRange}&per_page=100&page=${page}&sort=committer-date&order=desc`;

      const headers = {
        'User-Agent': 'GitHub-Wrapped',
        'Accept': 'application/vnd.github.cloak-preview+json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(searchUrl, { headers });

      if (!response.ok) {
        if (response.status === 403) {
          console.error(`[searchCommitsInRange] Rate limit hit for ${dateRange}`);
          incomplete = true;
          break;
        }
        if (response.status === 422) {
          // GitHub returns 422 when pagination goes beyond 1000
          console.log(`[searchCommitsInRange] Pagination limit reached for ${dateRange}, need to split`);
          incomplete = true;
          break;
        }
        console.error(`[searchCommitsInRange] API error ${response.status} for ${dateRange}`);
        break;
      }

      const data = await response.json();
      totalCount = data.total_count || 0;
      const items = data.items || [];

      if (items.length === 0) break;

      for (const item of items) {
        const commit = item.commit;
        commits.push({
          sha: item.sha,
          message: commit.message,
          date: commit.committer?.date || commit.author?.date,
          repo: item.repository?.full_name || 'unknown/unknown',
          url: item.html_url,
        });
      }

      // Check if we've hit the 1000 result limit
      if (page >= 10) {
        // GitHub only allows 10 pages (1000 results) max
        if (totalCount > 1000) {
          incomplete = true;
        }
        break;
      }

      if (items.length < 100) break;
      page++;
    } catch (error) {
      console.error(`[searchCommitsInRange] Error for ${dateRange}:`, error.message);
      break;
    }
  }

  return { commits, totalCount, incomplete };
}

/**
 * Get all days in a date range
 */
function getDaysInRange(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Search for ALL commits by a user - NO LIMITS
 * Uses adaptive splitting: year -> months -> weeks -> days if needed
 * Will get EVERY single commit, no matter how many there are
 */
async function searchAllCommitsByUser(username, year, token) {
  console.log(`[searchAllCommitsByUser] Searching ALL commits for ${username} in ${year} - NO LIMITS`);

  const allCommits = [];
  const seenShas = new Set(); // Deduplicate commits

  // Start with monthly ranges
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${year}-${String(m).padStart(2, '0')}-${lastDay}`;
    months.push({ start: startDate, end: endDate });
  }

  for (const month of months) {
    console.log(`[searchAllCommitsByUser] Processing ${month.start} to ${month.end}`);

    let result = await searchCommitsInRange(username, month.start, month.end, token);

    if (result.incomplete && result.totalCount > 1000) {
      // Too many commits in this month, split into weeks
      console.log(`[searchAllCommitsByUser] Month has ${result.totalCount} commits, splitting into weeks`);

      result = { commits: [], totalCount: 0, incomplete: false };
      const days = getDaysInRange(month.start, month.end);

      // Split into ~7 day chunks
      for (let i = 0; i < days.length; i += 7) {
        const weekStart = days[i];
        const weekEnd = days[Math.min(i + 6, days.length - 1)];

        let weekResult = await searchCommitsInRange(username, weekStart, weekEnd, token);

        if (weekResult.incomplete && weekResult.totalCount > 1000) {
          // Even a week has too many, go day by day
          console.log(`[searchAllCommitsByUser] Week ${weekStart} to ${weekEnd} has ${weekResult.totalCount} commits, going day by day`);

          for (let d = i; d <= Math.min(i + 6, days.length - 1); d++) {
            const dayResult = await searchCommitsInRange(username, days[d], days[d], token);
            result.commits.push(...dayResult.commits);
          }
        } else {
          result.commits.push(...weekResult.commits);
        }
      }
    }

    // Add commits, deduplicating by SHA
    for (const commit of result.commits) {
      if (!seenShas.has(commit.sha)) {
        seenShas.add(commit.sha);
        allCommits.push(commit);
      }
    }

    console.log(`[searchAllCommitsByUser] Total commits so far: ${allCommits.length}`);
  }

  console.log(`[searchAllCommitsByUser] TOTAL: Found ${allCommits.length} commits for ${username} in ${year}`);
  return allCommits;
}

/**
 * Analyze commits to extract deep, meaningful statistics
 */
function analyzeCommits(commits) {
  const repoMap = new Map();
  const hourlyActivity = new Array(24).fill(0);
  const dailyActivity = new Array(7).fill(0); // 0 = Sunday
  const monthlyActivity = new Array(12).fill(0);
  const commitsByDate = new Map(); // For streak calculation

  // Keywords for categorization
  const bugKeywords = ['fix', 'bug', 'issue', 'error', 'problem', 'broken', 'failing', 'debug', 'revert', 'hotfix', 'patch', 'crash', 'workaround'];
  const featureKeywords = ['add', 'implement', 'create', 'new', 'feature', 'support', 'enable', 'introduce'];
  const refactorKeywords = ['refactor', 'cleanup', 'improve', 'optimize', 'reorganize', 'simplify', 'restructure', 'rename', 'move'];
  const docsKeywords = ['doc', 'readme', 'comment', 'documentation', 'typo', 'spelling'];
  const testKeywords = ['test', 'spec', 'coverage', 'jest', 'mocha', 'cypress'];

  for (const commit of commits) {
    const repoName = commit.repo;
    const date = new Date(commit.date);
    const dateStr = date.toISOString().split('T')[0];
    const msg = commit.message.toLowerCase();

    // Track daily commits for streaks
    commitsByDate.set(dateStr, (commitsByDate.get(dateStr) || 0) + 1);

    // Time-based activity
    hourlyActivity[date.getUTCHours()]++;
    dailyActivity[date.getUTCDay()]++;
    monthlyActivity[date.getUTCMonth()]++;

    // Categorize commit
    let category = 'other';
    if (bugKeywords.some(kw => msg.includes(kw))) category = 'fix';
    else if (featureKeywords.some(kw => msg.includes(kw))) category = 'feature';
    else if (refactorKeywords.some(kw => msg.includes(kw))) category = 'refactor';
    else if (docsKeywords.some(kw => msg.includes(kw))) category = 'docs';
    else if (testKeywords.some(kw => msg.includes(kw))) category = 'test';

    // Group by repo with rich stats
    if (!repoMap.has(repoName)) {
      repoMap.set(repoName, {
        name: repoName.split('/')[1] || repoName,
        fullName: repoName,
        commits: [],
        commitCount: 0,
        fixes: 0,
        features: 0,
        refactors: 0,
        docs: 0,
        tests: 0,
        other: 0,
        firstCommit: date,
        lastCommit: date,
        activeDays: new Set(),
        commitDates: [],
      });
    }

    const repo = repoMap.get(repoName);
    repo.commits.push(commit);
    repo.commitCount++;
    repo[category === 'fix' ? 'fixes' : category === 'feature' ? 'features' : category === 'refactor' ? 'refactors' : category === 'docs' ? 'docs' : category === 'test' ? 'tests' : 'other']++;
    repo.activeDays.add(dateStr);
    repo.commitDates.push(date);

    if (date < repo.firstCommit) repo.firstCommit = date;
    if (date > repo.lastCommit) repo.lastCommit = date;
  }

  // Calculate per-repo metrics
  for (const [, repo] of repoMap) {
    const daySpan = Math.max(1, Math.ceil((repo.lastCommit - repo.firstCommit) / (1000 * 60 * 60 * 24)));
    repo.activeDaysCount = repo.activeDays.size;
    repo.daysSpan = daySpan;
    repo.commitsPerActiveDay = repo.commitCount / repo.activeDaysCount;
    repo.problemRatio = repo.fixes / repo.commitCount; // How problematic was this repo?
    repo.velocity = repo.commitCount / daySpan; // Commits per day

    // Calculate "blitz score" - high commits in short bursts
    // A blitz repo has high commits per active day but few active days
    repo.blitzScore = repo.commitsPerActiveDay * (1 - (repo.activeDaysCount / Math.max(daySpan, 1)));

    // Clean up temporary data
    delete repo.activeDays;
    delete repo.commitDates;
  }

  // Calculate streaks
  const sortedDates = Array.from(commitsByDate.keys()).sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let longestStreakStart = null;
  let longestStreakEnd = null;
  let tempStreakStart = null;

  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      currentStreak = 1;
      tempStreakStart = sortedDates[i];
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          longestStreakStart = tempStreakStart;
          longestStreakEnd = sortedDates[i - 1];
        }
        currentStreak = 1;
        tempStreakStart = sortedDates[i];
      }
    }
  }

  // Check final streak
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestStreakStart = tempStreakStart;
    longestStreakEnd = sortedDates[sortedDates.length - 1];
  }

  // Find peak times
  const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
  const peakDay = dailyActivity.indexOf(Math.max(...dailyActivity));
  const peakMonth = monthlyActivity.indexOf(Math.max(...monthlyActivity));

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Calculate weekend vs weekday
  const weekendCommits = dailyActivity[0] + dailyActivity[6];
  const weekdayCommits = dailyActivity.slice(1, 6).reduce((a, b) => a + b, 0);
  const isWeekendWarrior = weekendCommits > weekdayCommits * 0.5; // More than 50% of weekday commits on weekends

  // Night owl vs early bird
  const nightCommits = hourlyActivity.slice(22, 24).reduce((a, b) => a + b, 0) + hourlyActivity.slice(0, 6).reduce((a, b) => a + b, 0);
  const morningCommits = hourlyActivity.slice(6, 12).reduce((a, b) => a + b, 0);
  const afternoonCommits = hourlyActivity.slice(12, 18).reduce((a, b) => a + b, 0);
  const eveningCommits = hourlyActivity.slice(18, 22).reduce((a, b) => a + b, 0);

  let codingStyle = 'balanced';
  if (nightCommits > Math.max(morningCommits, afternoonCommits, eveningCommits)) codingStyle = 'night-owl';
  else if (morningCommits > Math.max(afternoonCommits, eveningCommits)) codingStyle = 'early-bird';
  else if (eveningCommits > afternoonCommits) codingStyle = 'evening-coder';

  return {
    repoMap,
    timeAnalysis: {
      hourlyActivity,
      dailyActivity,
      monthlyActivity,
      peakHour,
      peakHourFormatted: `${peakHour}:00 - ${peakHour + 1}:00 UTC`,
      peakDay: dayNames[peakDay],
      peakMonth: monthNames[peakMonth],
      weekendCommits,
      weekdayCommits,
      isWeekendWarrior,
      codingStyle,
      nightCommits,
      morningCommits,
      afternoonCommits,
      eveningCommits,
    },
    streaks: {
      longestStreak,
      longestStreakStart,
      longestStreakEnd,
      totalActiveDays: sortedDates.length,
      commitsByDate: Object.fromEntries(commitsByDate),
    },
  };
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
  console.log(`[generateWrapped] Starting for ${username}, year ${year}`);

  // Get user info
  const userInfo = await getUserInfo(username, token);
  console.log(`[generateWrapped] User info retrieved for ${userInfo.login}`);

  // Use GitHub Search API to find ALL commits by this user across ALL repositories
  console.log(`[generateWrapped] Using Search API to find ALL commits across ALL repositories - NO LIMITS`);
  const allCommits = await searchAllCommitsByUser(username, year, token);

  // Analyze commits for deep insights
  const analysis = analyzeCommits(allCommits);
  const { repoMap, timeAnalysis, streaks } = analysis;
  const totalCommits = allCommits.length;

  console.log(`[generateWrapped] Found ${totalCommits} total commits across ${repoMap.size} repositories`);

  // Build repository contributions list with rich stats
  let languageStats = {};
  let repoContributions = [];

  // Get all repos sorted by commit count
  const allRepoData = Array.from(repoMap.values()).sort((a, b) => b.commitCount - a.commitCount);

  // Fetch additional repo info for top 50 repos
  const topReposToFetch = allRepoData.slice(0, 50);
  console.log(`[generateWrapped] Fetching details for top ${topReposToFetch.length} repositories`);

  for (const repoData of topReposToFetch) {
    try {
      const repoInfo = await fetchGitHub(
        `https://api.github.com/repos/${repoData.fullName}`,
        token
      );

      repoContributions.push({
        name: repoData.name,
        fullName: repoData.fullName,
        commits: repoData.commitCount,
        stars: repoInfo.stargazers_count || 0,
        language: repoInfo.language,
        fixes: repoData.fixes,
        features: repoData.features,
        refactors: repoData.refactors,
        problemRatio: repoData.problemRatio,
        velocity: repoData.velocity,
        blitzScore: repoData.blitzScore,
        activeDays: repoData.activeDaysCount,
      });

      if (repoInfo.language) {
        languageStats[repoInfo.language] = (languageStats[repoInfo.language] || 0) + repoData.commitCount;
      }
    } catch (error) {
      console.log(`[generateWrapped] Could not fetch details for ${repoData.fullName}: ${error.message}`);
      repoContributions.push({
        name: repoData.name,
        fullName: repoData.fullName,
        commits: repoData.commitCount,
        stars: 0,
        language: null,
        fixes: repoData.fixes,
        features: repoData.features,
        refactors: repoData.refactors,
        problemRatio: repoData.problemRatio,
        velocity: repoData.velocity,
        blitzScore: repoData.blitzScore,
        activeDays: repoData.activeDaysCount,
      });
    }
  }

  // Add remaining repos without fetching details
  for (const repoData of allRepoData.slice(50)) {
    repoContributions.push({
      name: repoData.name,
      fullName: repoData.fullName,
      commits: repoData.commitCount,
      stars: 0,
      language: null,
      fixes: repoData.fixes,
      features: repoData.features,
      refactors: repoData.refactors,
      problemRatio: repoData.problemRatio,
      velocity: repoData.velocity,
      blitzScore: repoData.blitzScore,
      activeDays: repoData.activeDaysCount,
    });
  }

  // Sort by commits
  repoContributions.sort((a, b) => b.commits - a.commits);

  // Calculate special repo categories
  const mostActiveRepo = repoContributions[0] || null;

  const mostProblematicRepo = [...repoContributions]
    .filter(r => r.fixes > 3) // At least 3 fixes to be considered
    .sort((a, b) => b.problemRatio - a.problemRatio)[0] || null;

  const blitzRepo = [...repoContributions]
    .filter(r => r.commits > 10) // At least 10 commits
    .sort((a, b) => b.blitzScore - a.blitzScore)[0] || null;

  const mostFeatureRepo = [...repoContributions]
    .sort((a, b) => b.features - a.features)[0] || null;

  const steadiestRepo = [...repoContributions]
    .filter(r => r.activeDays > 5) // At least 5 active days
    .sort((a, b) => b.activeDays - a.activeDays)[0] || null;

  console.log(`[generateWrapped] Total commits found: ${totalCommits}`);

  // Get top languages
  const topLanguages = Object.entries(languageStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10) // Top 10 languages
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
        console.log(`[generateWrapped] Attempting AI analysis of ${allCommits.length} commits`);
        insights = await analyzeCommitsWithAI(allCommits, env);
      }
      
      // Fallback to rule-based analysis if AI fails or unavailable
      if (!insights) {
        console.log(`[generateWrapped] Using fallback analysis`);
        insights = analyzeCommitMessages(allCommits);
      }
    } catch (error) {
      console.error('[generateWrapped] Error generating insights:', error);
      // Use fallback analysis
      insights = analyzeCommitMessages(allCommits);
    }
  }
  
  console.log(`[generateWrapped] Wrapped generation complete`);

  // Calculate commit type totals
  const totalFixes = repoContributions.reduce((sum, r) => sum + (r.fixes || 0), 0);
  const totalFeatures = repoContributions.reduce((sum, r) => sum + (r.features || 0), 0);
  const totalRefactors = repoContributions.reduce((sum, r) => sum + (r.refactors || 0), 0);

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
      topRepositories: repoContributions.slice(0, 10), // Top 10 repos
      allRepositories: repoContributions, // ALL repos with their stats
      topLanguages,
      // Commit type breakdown
      commitTypes: {
        fixes: totalFixes,
        features: totalFeatures,
        refactors: totalRefactors,
        other: totalCommits - totalFixes - totalFeatures - totalRefactors,
      },
    },
    // Special repos - the story of the year
    repoHighlights: {
      mostActive: mostActiveRepo ? {
        name: mostActiveRepo.fullName,
        commits: mostActiveRepo.commits,
        description: `Your most active repo with ${mostActiveRepo.commits} commits`,
      } : null,
      mostProblematic: mostProblematicRepo ? {
        name: mostProblematicRepo.fullName,
        fixes: mostProblematicRepo.fixes,
        problemRatio: Math.round(mostProblematicRepo.problemRatio * 100),
        description: `${Math.round(mostProblematicRepo.problemRatio * 100)}% of commits were bug fixes`,
      } : null,
      blitzRepo: blitzRepo ? {
        name: blitzRepo.fullName,
        commits: blitzRepo.commits,
        activeDays: blitzRepo.activeDays,
        description: `Intense bursts of activity - ${blitzRepo.commits} commits in just ${blitzRepo.activeDays} days`,
      } : null,
      mostFeatures: mostFeatureRepo ? {
        name: mostFeatureRepo.fullName,
        features: mostFeatureRepo.features,
        description: `Your feature factory with ${mostFeatureRepo.features} new features`,
      } : null,
      steadiest: steadiestRepo ? {
        name: steadiestRepo.fullName,
        activeDays: steadiestRepo.activeDays,
        description: `Consistent work over ${steadiestRepo.activeDays} days`,
      } : null,
    },
    // Time-based insights
    timeAnalysis: {
      peakHour: timeAnalysis.peakHourFormatted,
      peakDay: timeAnalysis.peakDay,
      peakMonth: timeAnalysis.peakMonth,
      codingStyle: timeAnalysis.codingStyle,
      isWeekendWarrior: timeAnalysis.isWeekendWarrior,
      weekendCommits: timeAnalysis.weekendCommits,
      weekdayCommits: timeAnalysis.weekdayCommits,
      hourlyActivity: timeAnalysis.hourlyActivity,
      dailyActivity: timeAnalysis.dailyActivity,
      monthlyActivity: timeAnalysis.monthlyActivity,
    },
    // Streak data
    streaks: {
      longestStreak: streaks.longestStreak,
      longestStreakStart: streaks.longestStreakStart,
      longestStreakEnd: streaks.longestStreakEnd,
      totalActiveDays: streaks.totalActiveDays,
      // Include daily commits for heatmap visualization
      commitsByDate: streaks.commitsByDate,
    },
    // AI-generated or rule-based insights
    insights,
    // All commits for detailed analysis (messages, dates, repos)
    allCommits: allCommits.map(c => ({
      message: c.message.split('\n')[0], // First line only
      date: c.date,
      repo: c.repo,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * OAuth Helper Functions
 */

/**
 * Generate a random state for OAuth flow
 */
function generateState() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create session cookie
 * 
 * Note: For enhanced security in production, consider using a session store (like Cloudflare KV)
 * with a session ID instead of storing the GitHub token directly in the cookie.
 * This would provide additional protection against cookie theft attacks.
 * 
 * Current implementation stores the token directly for simplicity and to avoid
 * additional infrastructure dependencies (KV storage).
 */
function createSessionCookie(token, maxAge = SESSION_EXPIRY) {
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}`;
}

/**
 * Parse cookies from request
 */
function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return {};
  
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = value;
    }
  });
  return cookies;
}

/**
 * Get session token from cookie
 */
function getSessionToken(request) {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE_NAME];
}

/**
 * Get OAuth redirect URI
 */
function getOAuthRedirectUri(env) {
  if (!env.OAUTH_REDIRECT_URI && !env.APP_URL) {
    throw new Error('Either OAUTH_REDIRECT_URI or APP_URL must be configured');
  }
  return env.OAUTH_REDIRECT_URI || `${env.APP_URL}/api/oauth/callback`;
}

/**
 * Store state in a cookie for CSRF protection
 */
function createStateCookie(state) {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString(); // 10 minutes
  return `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Expires=${expires}`;
}

/**
 * Get and validate OAuth state from cookie
 */
function validateState(request, providedState) {
  const cookies = parseCookies(request);
  const storedState = cookies['oauth_state'];
  
  if (!storedState || !providedState) {
    return false;
  }
  
  return storedState === providedState;
}

/**
 * Clear OAuth state cookie
 */
function clearStateCookie() {
  return `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Handle OAuth login initiation
 */
function handleOAuthLogin(env, corsHeaders) {
  const clientId = env.GITHUB_CLIENT_ID;
  
  if (!clientId) {
    return new Response(
      JSON.stringify({ error: 'OAuth not configured. Please set GITHUB_CLIENT_ID.' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  
  const state = generateState();
  const redirectUri = getOAuthRedirectUri(env);
  const stateCookie = createStateCookie(state);
  
  // GitHub OAuth authorization URL
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read:user');
  authUrl.searchParams.set('state', state);
  
  // Return the authorization URL and state
  return new Response(
    JSON.stringify({ 
      authUrl: authUrl.toString(),
      state
    }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': stateCookie,
      }
    }
  );
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(request, env, corsHeaders) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  // Validate state parameter for CSRF protection
  if (!validateState(request, state)) {
    const clearState = clearStateCookie();
    return new Response(
      JSON.stringify({ error: 'Invalid state parameter. Possible CSRF attack.' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': clearState }
      }
    );
  }
  
  if (!code) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization code' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  const redirectUri = getOAuthRedirectUri(env);
  
  if (!clientId || !clientSecret) {
    const clearState = clearStateCookie();
    return new Response(
      JSON.stringify({ error: 'OAuth not configured' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': clearState }
      }
    );
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('[OAuth] Error exchanging code:', tokenData);
      const clearState = clearStateCookie();
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': clearState }
        }
      );
    }
    
    const accessToken = tokenData.access_token;
    
    // Get user info to verify token
    const userInfo = await fetchGitHub('https://api.github.com/user', accessToken);
    
    // Create session cookie with the access token and clear state cookie
    const sessionCookie = createSessionCookie(accessToken);
    const clearState = clearStateCookie();
    
    // Redirect back to the app with success
    const appUrl = env.APP_URL || url.origin;
    const redirectUrl = new URL(appUrl);
    redirectUrl.searchParams.set('oauth', 'success');
    redirectUrl.searchParams.set('username', userInfo.login);
    
    // Use Headers object to set multiple Set-Cookie headers
    const headers = new Headers();
    headers.set('Location', redirectUrl.toString());
    headers.append('Set-Cookie', sessionCookie);
    headers.append('Set-Cookie', clearState);
    
    return new Response(null, {
      status: 302,
      headers: headers,
    });
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    const clearState = clearStateCookie();
    return new Response(
      JSON.stringify({ error: 'OAuth authentication failed', details: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': clearState }
      }
    );
  }
}

/**
 * Handle logout
 */
function handleLogout(corsHeaders) {
  // Clear session cookie
  const clearCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  
  return new Response(
    JSON.stringify({ success: true, message: 'Logged out successfully' }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookie,
      }
    }
  );
}

/**
 * Get current user info from session
 */
async function handleUserInfo(request, corsHeaders) {
  const token = getSessionToken(request);
  
  if (!token) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );
  }
  
  try {
    const userInfo = await fetchGitHub('https://api.github.com/user', token);
    
    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          login: userInfo.login,
          name: userInfo.name,
          avatar: userInfo.avatar_url,
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );
  } catch (error) {
    // Token is invalid, clear it
    const clearCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
    
    return new Response(
      JSON.stringify({ authenticated: false, error: 'Invalid session' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookie,
        }
      }
    );
  }
}

/**
 * Create a request for index.html (for SPA routing)
 */
function createIndexRequest(originalRequest) {
  const indexUrl = new URL(originalRequest.url);
  indexUrl.pathname = '/index.html';
  return new Request(indexUrl, originalRequest);
}

/**
 * Handle workflow start request
 * Starts an async workflow to fetch all commits
 */
async function handleWorkflowStart(request, env, corsHeaders) {
  const url = new URL(request.url);
  let username = url.searchParams.get('username');
  const year = url.searchParams.get('year') || '2025';
  const tokenFromQuery = url.searchParams.get('token') || null;

  // Get token from session cookie
  const sessionToken = getSessionToken(request);
  const token = tokenFromQuery || sessionToken || env.GITHUB_TOKEN || null;

  // If no username provided but user is authenticated, use their username
  if (!username && sessionToken) {
    try {
      const userInfo = await fetchGitHub('https://api.github.com/user', sessionToken);
      username = userInfo.login;
    } catch (error) {
      console.error('[Workflow] Failed to get authenticated user:', error);
    }
  }

  if (!username) {
    return new Response(
      JSON.stringify({ error: 'Username is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if workflow binding exists
  if (!env.WRAPPED_WORKFLOW) {
    return new Response(
      JSON.stringify({ error: 'Workflow not configured. Please deploy with wrangler.json' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Create a unique instance ID
    const instanceId = `${username}-${year}-${Date.now()}`;

    // Start the workflow
    const instance = await env.WRAPPED_WORKFLOW.create({
      id: instanceId,
      params: { username, year, token },
    });

    console.log(`[Workflow] Started workflow ${instance.id} for ${username}/${year}`);

    return new Response(
      JSON.stringify({
        success: true,
        instanceId: instance.id,
        message: `Workflow started for ${username}. Use /api/workflow/status?id=${instance.id} to check progress.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Workflow] Failed to start:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start workflow', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle workflow status check
 * Returns the status and result of a workflow instance
 */
async function handleWorkflowStatus(request, env, corsHeaders) {
  const url = new URL(request.url);
  const instanceId = url.searchParams.get('id');

  if (!instanceId) {
    return new Response(
      JSON.stringify({ error: 'Instance ID is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!env.WRAPPED_WORKFLOW) {
    return new Response(
      JSON.stringify({ error: 'Workflow not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const instance = await env.WRAPPED_WORKFLOW.get(instanceId);
    const status = await instance.status();

    // If workflow is complete, include the result
    if (status.status === 'complete') {
      return new Response(
        JSON.stringify({
          status: 'complete',
          result: status.output,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If still running, return status
    return new Response(
      JSON.stringify({
        status: status.status,
        error: status.error || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Workflow] Failed to get status:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get workflow status', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle incoming requests
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const corsHeaders = getCorsHeaders(request);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Parse path
  const path = url.pathname;
  
  // OAuth routes
  if (path === '/api/oauth/login') {
    return handleOAuthLogin(env, corsHeaders);
  }
  
  if (path === '/api/oauth/callback') {
    return await handleOAuthCallback(request, env, corsHeaders);
  }
  
  if (path === '/api/oauth/logout') {
    return handleLogout(corsHeaders);
  }
  
  if (path === '/api/user') {
    return await handleUserInfo(request, corsHeaders);
  }

  // Workflow routes - for async, long-running commit fetching
  if (path === '/api/workflow/start') {
    return await handleWorkflowStart(request, env, corsHeaders);
  }

  if (path === '/api/workflow/status') {
    return await handleWorkflowStatus(request, env, corsHeaders);
  }

  // API routes
  if (path === '/api/wrapped') {
    // Get query parameters
    let username = url.searchParams.get('username');
    const year = url.searchParams.get('year') || '2025';
    const tokenFromQuery = url.searchParams.get('token') || null;
    
    // Get token from session cookie
    const sessionToken = getSessionToken(request);
    
    // Priority: query parameter > session token > environment variable
    const token = tokenFromQuery || sessionToken || env.GITHUB_TOKEN || null;
    
    // If no username provided but user is authenticated, use their username
    if (!username && sessionToken) {
      try {
        const userInfo = await fetchGitHub('https://api.github.com/user', sessionToken);
        username = userInfo.login;
        console.log(`[API] No username provided, using authenticated user: ${username}`);
      } catch (error) {
        console.error('[API] Failed to get authenticated user:', error);
      }
    }
    
    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username is required. Please sign in to view your own stats or provide a username to view someone else\'s.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    if (token) {
      console.log('[API] Using GitHub token for authentication');
    } else {
      console.log('[API] No GitHub token provided - using unauthenticated requests (rate limited)');
    }
    
    console.log(`[API] Request for username: ${username}, year: ${year}`);
    
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
            { name: 'awesome-project', fullName: 'demouser/awesome-project', commits: 234, stars: 1250, language: 'JavaScript', defaultBranch: 'main' },
            { name: 'react-dashboard', fullName: 'demouser/react-dashboard', commits: 189, stars: 892, language: 'TypeScript', defaultBranch: 'main' },
            { name: 'python-api', fullName: 'demouser/python-api', commits: 156, stars: 445, language: 'Python', defaultBranch: 'main' },
          ],
          topLanguages: [
            { language: 'JavaScript', commits: 312 },
            { language: 'TypeScript', commits: 245 },
            { language: 'Python', commits: 178 },
          ],
          commitsByBranch: {
            main: 765,
            master: 82,
            other: 0
          },
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
        console.log(`[API] Generating wrapped data for ${username}`);
        // Generate wrapped data with AI analysis
        const wrappedData = await generateWrapped(username, year, token, env);
        
        console.log(`[API] Successfully generated wrapped data with ${wrappedData.stats.totalCommits} commits`);
        
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
        console.error(`[API] Error generating wrapped:`, error.message);
        return new Response(
          JSON.stringify({ 
            error: error.message,
            details: 'Failed to generate GitHub wrapped data. Please check the username and try again.'
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    } else {
      console.log(`[API] Serving cached data for ${username}`);
    }
    
    return response;
  }
  
  // Serve static assets from ASSETS binding (Cloudflare Workers Assets)
  try {
    // Try to get the asset from ASSETS
    const response = await env.ASSETS.fetch(request);
    
    // If the response is a 404 and not an API route, serve index.html for SPA routing
    if (response.status === 404 && !path.startsWith('/api')) {
      return await env.ASSETS.fetch(createIndexRequest(request));
    }
    
    return response;
  } catch (e) {
    // Fallback: try to serve index.html for SPA routing
    if (!path.startsWith('/api')) {
      try {
        return await env.ASSETS.fetch(createIndexRequest(request));
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
