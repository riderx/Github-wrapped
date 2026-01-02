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

// Build timestamp injected at deploy time via --define BUILD_TIMESTAMP
// This automatically invalidates cache on each new deployment
// Falls back to 'dev' for local development
const CACHE_VERSION = typeof BUILD_TIMESTAMP !== 'undefined' ? BUILD_TIMESTAMP : 'dev';

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
 * Fetch commit details with file changes for richer context
 * Returns file stats (additions, deletions, files changed) for a commit
 */
async function fetchCommitDetails(repo, sha, token) {
  try {
    const data = await fetchGitHub(`https://api.github.com/repos/${repo}/commits/${sha}`, token);
    return {
      sha,
      files: (data.files || []).slice(0, 5).map(f => ({
        filename: f.filename,
        status: f.status, // added, removed, modified, renamed
        additions: f.additions,
        deletions: f.deletions,
      })),
      stats: data.stats || { additions: 0, deletions: 0, total: 0 },
    };
  } catch (error) {
    console.error(`[fetchCommitDetails] Error fetching ${repo}/${sha}:`, error.message);
    return null;
  }
}

/**
 * Fetch details for multiple fix commits to provide AI with richer context
 * Limits to top N commits to avoid rate limiting
 */
async function fetchFixCommitDetails(fixCommits, token, limit = 8) {
  const topFixes = fixCommits.slice(0, limit);
  const results = [];

  for (const commit of topFixes) {
    const details = await fetchCommitDetails(commit.repo, commit.sha, token);
    if (details) {
      results.push({
        ...commit,
        fileChanges: details.files,
        stats: details.stats,
      });
    }
  }

  return results;
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
 * Prepare comprehensive commit statistics for AI analysis
 */
function prepareCommitStats(allCommits) {
  const stats = {
    total: allCommits.length,
    byRepo: {},
    byMonth: {},
    byDayOfWeek: {},
    byHour: {},
    types: { fixes: [], features: [], refactors: [], docs: [], tests: [], other: [] },
    longestStreak: 0,
    lateNightCommits: 0,
    weekendCommits: 0,
    messageStats: { avgLength: 0, detailed: 0, oneLiner: 0 },
    significantCommits: [],
    revertedCommits: [],
    mergeCommits: [],
  };

  const struggleKeywords = ['fix', 'bug', 'issue', 'error', 'problem', 'broken', 'failing', 'debug', 'revert', 'hotfix', 'patch', 'workaround', 'crash', 'memory leak', 'timeout'];
  const featureKeywords = ['add', 'implement', 'create', 'new', 'feature', 'support', 'enable', 'introduce', 'launch'];
  const refactorKeywords = ['refactor', 'cleanup', 'improve', 'optimize', 'reorganize', 'simplify', 'restructure', 'migrate', 'upgrade'];
  const docsKeywords = ['doc', 'readme', 'comment', 'documentation', 'changelog'];
  const testKeywords = ['test', 'spec', 'coverage', 'e2e', 'unit test', 'integration'];

  let totalMessageLength = 0;
  const dates = [];

  allCommits.forEach(commit => {
    const msg = commit.message.toLowerCase();
    const firstLine = commit.message.split('\n')[0];
    const date = new Date(commit.date);
    const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const dayOfWeek = date.toLocaleString('default', { weekday: 'long' });
    const hour = date.getHours();

    dates.push(date);

    // By repo
    stats.byRepo[commit.repo] = stats.byRepo[commit.repo] || { count: 0, commits: [] };
    stats.byRepo[commit.repo].count++;
    stats.byRepo[commit.repo].commits.push({ message: firstLine, date: commit.date });

    // By month
    stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

    // By day of week
    stats.byDayOfWeek[dayOfWeek] = (stats.byDayOfWeek[dayOfWeek] || 0) + 1;

    // By hour
    stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

    // Weekend commits
    if (date.getDay() === 0 || date.getDay() === 6) stats.weekendCommits++;

    // Late night commits (10pm - 4am)
    if (hour >= 22 || hour <= 4) stats.lateNightCommits++;

    // Message stats
    totalMessageLength += commit.message.length;
    if (commit.message.split('\n').length > 2) stats.messageStats.detailed++;
    else stats.messageStats.oneLiner++;

    // Categorize commits
    const commitData = { repo: commit.repo, sha: commit.sha, message: firstLine, date: commit.date, fullMessage: commit.message };

    if (msg.includes('revert')) stats.revertedCommits.push(commitData);
    if (msg.includes('merge')) stats.mergeCommits.push(commitData);

    if (struggleKeywords.some(kw => msg.includes(kw))) {
      stats.types.fixes.push(commitData);
    } else if (featureKeywords.some(kw => msg.includes(kw))) {
      stats.types.features.push(commitData);
    } else if (refactorKeywords.some(kw => msg.includes(kw))) {
      stats.types.refactors.push(commitData);
    } else if (docsKeywords.some(kw => msg.includes(kw))) {
      stats.types.docs.push(commitData);
    } else if (testKeywords.some(kw => msg.includes(kw))) {
      stats.types.tests.push(commitData);
    } else {
      stats.types.other.push(commitData);
    }

    // Significant commits (detailed messages or important keywords)
    if (commit.message.length > 200 ||
        msg.includes('major') || msg.includes('breaking') || msg.includes('release') ||
        msg.includes('shipped') || msg.includes('complete') || msg.includes('milestone')) {
      stats.significantCommits.push(commitData);
    }
  });

  stats.messageStats.avgLength = Math.round(totalMessageLength / allCommits.length);

  // Calculate longest streak
  if (dates.length > 0) {
    dates.sort((a, b) => a - b);
    let currentStreak = 1;
    let maxStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diffDays = Math.floor((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    stats.longestStreak = maxStreak;
  }

  return stats;
}

/**
 * Generate a comprehensive year-in-review using AI
 * Uses multiple passes to generate deep, insightful analysis
 */
async function analyzeCommitsWithAI(allCommits, env, token = null) {
  if (!allCommits || allCommits.length === 0) {
    return null;
  }

  console.log(`[AI Analysis] Starting deep analysis of ${allCommits.length} commits`);

  // Prepare comprehensive statistics
  const stats = prepareCommitStats(allCommits);

  // Sort repos by commit count
  const topRepos = Object.entries(stats.byRepo)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 20);

  // Sort months by commits
  const monthlyActivity = Object.entries(stats.byMonth)
    .sort(([,a], [,b]) => b - a);

  // Fetch detailed file changes for top bug fix commits to give AI richer context
  let fixCommitDetails = [];
  if (token && stats.types.fixes.length > 0) {
    console.log(`[AI Analysis] Fetching file change details for top fix commits...`);
    fixCommitDetails = await fetchFixCommitDetails(stats.types.fixes, token, 10);
    console.log(`[AI Analysis] Got details for ${fixCommitDetails.length} fix commits`);
  }

  // Format fix samples - use detailed info when available, fallback to basic format
  let fixSamplesWithContext = '';
  if (fixCommitDetails.length > 0) {
    fixSamplesWithContext = fixCommitDetails.map(c => {
      const files = c.fileChanges.map(f => `  - ${f.filename} (${f.status}: +${f.additions}/-${f.deletions})`).join('\n');
      return `[${c.repo}] ${c.message}\nFiles changed (${c.stats.total} total: +${c.stats.additions}/-${c.stats.deletions}):\n${files}`;
    }).join('\n\n');
  }

  // Also include additional fix commit messages (without file details)
  const additionalFixSamples = stats.types.fixes.slice(fixCommitDetails.length, 30)
    .map(c => `[${c.repo}] ${c.message}`).join('\n');

  const featureSamples = stats.types.features.slice(0, 30).map(c => `[${c.repo}] ${c.message}`).join('\n');
  const significantSamples = stats.significantCommits.slice(0, 20).map(c => `[${c.repo}] ${c.message}\n${c.fullMessage.split('\n').slice(1, 4).join('\n')}`).join('\n\n');
  const revertSamples = stats.revertedCommits.slice(0, 10).map(c => `[${c.repo}] ${c.message}`).join('\n');

  // Create the comprehensive prompt
  const analysisPrompt = `You are an expert storyteller and data analyst. Your task is to write a COMPREHENSIVE, DETAILED year-in-review for a developer based on their GitHub activity. This should be a rich, insightful, and substantial narrative - think of it like an annual report or a detailed personal retrospective.

## RAW DATA

### Overall Statistics
- Total Commits: ${stats.total}
- Repositories Contributed To: ${Object.keys(stats.byRepo).length}
- Bug Fixes & Issue Resolution: ${stats.types.fixes.length} commits
- New Features & Implementations: ${stats.types.features.length} commits
- Refactoring & Improvements: ${stats.types.refactors.length} commits
- Documentation: ${stats.types.docs.length} commits
- Testing: ${stats.types.tests.length} commits
- Weekend Commits: ${stats.weekendCommits} (${Math.round(stats.weekendCommits/stats.total*100)}%)
- Late Night Commits (10PM-4AM): ${stats.lateNightCommits} (${Math.round(stats.lateNightCommits/stats.total*100)}%)
- Longest Coding Streak: ${stats.longestStreak} consecutive days
- Reverted Commits: ${stats.revertedCommits.length}
- Average Commit Message Length: ${stats.messageStats.avgLength} characters
- Detailed Commits (multi-line): ${stats.messageStats.detailed}
- One-liner Commits: ${stats.messageStats.oneLiner}

### Top Repositories (by commits)
${topRepos.map(([repo, data], i) => `${i+1}. ${repo}: ${data.count} commits`).join('\n')}

### Monthly Activity
${monthlyActivity.map(([month, count]) => `${month}: ${count} commits`).join('\n')}

### Day of Week Distribution
${Object.entries(stats.byDayOfWeek).sort(([,a],[,b]) => b-a).map(([day, count]) => `${day}: ${count}`).join(', ')}

### Bug Fixes with File Context (showing what was actually fixed)
${fixSamplesWithContext || 'No detailed fix data available'}

### Additional Bug Fix Commits
${additionalFixSamples || 'No additional bug fixes'}

### Sample New Features (showing accomplishments)
${featureSamples || 'No features recorded'}

### Significant/Major Commits
${significantSamples || 'No major milestones recorded'}

### Reverted Work (setbacks and pivots)
${revertSamples || 'No reverts recorded'}

---

## YOUR TASK

Write a comprehensive JSON response with the following structure. Each section should be DETAILED and SUBSTANTIAL:

{
  "executiveSummary": "A 3-4 paragraph executive summary of the entire year. What was this developer's journey? What defined their year? What should they be most proud of?",

  "story": "A compelling 2-3 paragraph narrative that tells the story of this developer's year as if you were writing a magazine profile.",

  "mainTheme": "One powerful sentence that captures the essence of their year.",

  "yearInNumbers": {
    "headline": "A catchy headline summarizing the numbers",
    "insights": ["Array of 5-7 specific, interesting statistical insights derived from the data"]
  },

  "biggestStruggles": {
    "overview": "A paragraph analyzing their struggles and challenges based on the fix commits and file changes",
    "challenges": ["Array of 4-6 meaningful challenge descriptions. IMPORTANT: Do NOT just copy commit messages! Analyze the file changes and commit patterns to write insightful descriptions like 'Tackled complex authentication flow issues across 3 components, refactoring token handling to prevent session timeouts' or 'Debugged memory leaks in the caching layer, optimizing data structures to reduce heap usage'. Each challenge should explain WHAT was hard and WHY it mattered, not just state the commit title."]
  },

  "proudMoments": {
    "overview": "A paragraph celebrating their wins and achievements",
    "achievements": ["Array of 4-6 specific achievements with context about why they matter"]
  },

  "projectSpotlight": {
    "overview": "Analysis of their project portfolio - what themes emerge?",
    "projects": [
      {
        "name": "repo name",
        "narrative": "2-3 sentences about what this project meant to their year",
        "impact": "One sentence about its significance"
      }
    ]
  },

  "workStyle": {
    "pace": "steady/burst/sprint/marathon",
    "approach": "perfectionist/pragmatic/experimental/methodical/etc",
    "description": "A detailed paragraph about their working style, coding habits, and patterns",
    "strengths": ["3-4 identified strengths based on data"],
    "growthAreas": ["2-3 areas for potential growth, framed positively"]
  },

  "technicalEvolution": {
    "narrative": "2-3 paragraphs about how their technical work evolved through the year",
    "keyTransitions": ["List of notable transitions or evolutions in their work"]
  },

  "topicsExplored": ["Array of 6-10 technical topics/technologies they worked on"],

  "monthByMonth": {
    "narrative": "A paragraph describing how activity flowed through the year",
    "peaks": ["2-3 peak periods with context about what was happening"],
    "valleys": ["1-2 slower periods with possible explanations"]
  },

  "funFacts": ["Array of 5-7 interesting, specific, and memorable fun facts about their coding year"],

  "quotableCommits": ["3-5 commit messages that stand out as particularly interesting, funny, or telling"],

  "yearAheadOutlook": "A paragraph of encouragement and forward-looking thoughts based on the patterns you see",

  "finalWords": "A powerful closing statement - something memorable they can take away from this year"
}

IMPORTANT GUIDELINES:
- Be SPECIFIC - reference actual data, repos, and commit messages
- Be INSIGHTFUL - don't just restate numbers, interpret them
- Be NARRATIVE - tell a story, don't just list facts
- Be SUBSTANTIAL - each section should be meaningful and detailed
- Be ENCOURAGING but HONEST - celebrate wins, acknowledge challenges
- Be PERSONAL - write as if you really understand this developer's journey
- NEVER just copy commit message titles as challenge or achievement descriptions. Use the file change context to understand WHAT was actually changed and write meaningful descriptions that explain the technical work and its significance.
- For challenges/struggles: analyze the file names and changes to infer what systems were being debugged (e.g., "auth.ts" suggests authentication issues, "cache.js" suggests caching problems)

Return ONLY the JSON, no other text.`;

  try {
    // Use the larger Llama 3.1 70B model for deeper analysis
    console.log('[AI Analysis] Calling Llama 3.1 70B for comprehensive analysis...');
    const response = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are an expert developer advocate, storyteller, and data analyst. You write compelling, insightful year-in-review narratives that make developers feel seen and celebrated. Your analysis is always data-driven, specific, and substantial. You ALWAYS respond with valid JSON only - no markdown, no code blocks, just pure JSON.'
        },
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 8000  // Much larger for comprehensive output
    });

    console.log('[AI Analysis] Response received, parsing...');

    // Parse AI response
    let aiInsights;
    try {
      const responseText = response.response || JSON.stringify(response);
      console.log('[AI Analysis] Response length:', responseText.length);

      // Try to extract JSON from response (handle potential markdown wrapping)
      let jsonText = responseText;

      // Remove markdown code blocks if present
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Try to extract JSON object
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiInsights = JSON.parse(jsonMatch[0]);
      } else {
        aiInsights = JSON.parse(jsonText);
      }

      console.log('[AI Analysis] Successfully parsed AI response');

      // Ensure backwards compatibility with old format
      if (!aiInsights.story && aiInsights.executiveSummary) {
        aiInsights.story = aiInsights.executiveSummary;
      }
      if (!aiInsights.biggestStruggles && aiInsights.biggestStruggles?.challenges) {
        aiInsights.biggestStruggles = aiInsights.biggestStruggles.challenges;
      }
      if (!aiInsights.proudMoments && aiInsights.proudMoments?.achievements) {
        aiInsights.proudMoments = aiInsights.proudMoments.achievements;
      }

      // Add raw stats for potential frontend use
      aiInsights._rawStats = {
        total: stats.total,
        repos: Object.keys(stats.byRepo).length,
        fixes: stats.types.fixes.length,
        features: stats.types.features.length,
        weekendCommits: stats.weekendCommits,
        lateNightCommits: stats.lateNightCommits,
        longestStreak: stats.longestStreak,
      };

    } catch (e) {
      console.error('[AI Analysis] Failed to parse AI response:', e);
      console.error('[AI Analysis] Raw response:', response.response?.substring(0, 500));
      return null;
    }

    return aiInsights;
  } catch (error) {
    console.error('[AI Analysis] AI analysis failed:', error);
    return null;
  }
}

/**
 * Analyze commit messages to extract insights (fallback method)
 * Enhanced to match the comprehensive AI format
 */
function analyzeCommitMessages(allCommits) {
  // Use the same stats preparation as AI analysis
  const stats = prepareCommitStats(allCommits);
  const totalCommits = allCommits.length;
  const repoCount = Object.keys(stats.byRepo).length;

  // Sort repos by commit count
  const topRepos = Object.entries(stats.byRepo)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 10);

  // Sort months
  const monthlyActivity = Object.entries(stats.byMonth)
    .sort(([,a], [,b]) => b - a);

  // Determine primary theme
  let primaryTheme = 'builder';
  let themeDescription = '';
  const fixRatio = stats.types.fixes.length / totalCommits;
  const featureRatio = stats.types.features.length / totalCommits;
  const refactorRatio = stats.types.refactors.length / totalCommits;

  if (featureRatio > 0.3) {
    primaryTheme = 'builder';
    themeDescription = `You were in creation mode! ${stats.types.features.length} commits focused on building new features across ${repoCount} repositories.`;
  } else if (fixRatio > 0.25) {
    primaryTheme = 'problem-solver';
    themeDescription = `You were the problem solver! ${stats.types.fixes.length} commits dedicated to fixing issues and making things work.`;
  } else if (refactorRatio > 0.15) {
    primaryTheme = 'perfectionist';
    themeDescription = `Quality was your focus! ${stats.types.refactors.length} commits improving and refactoring code to be better.`;
  } else {
    themeDescription = `You made ${totalCommits} commits across ${repoCount} repositories, building and refining your craft.`;
  }

  // Generate executive summary
  const executiveSummary = `This year, you made ${totalCommits.toLocaleString()} commits across ${repoCount} repositories. That's an impressive body of work that shows dedication to your craft.

Your most active project was ${topRepos[0]?.[0] || 'your main repository'} with ${topRepos[0]?.[1]?.count || 0} commits. You spent ${Math.round(stats.weekendCommits/totalCommits*100)}% of your commits on weekends and ${Math.round(stats.lateNightCommits/totalCommits*100)}% during late night hours (10PM-4AM), showing your commitment to shipping code.

${monthlyActivity[0] ? `Your peak month was ${monthlyActivity[0][0]} with ${monthlyActivity[0][1]} commits.` : ''} You maintained a longest streak of ${stats.longestStreak} consecutive days of coding.`;

  // Generate story
  const story = `${themeDescription}

With ${stats.types.features.length} feature commits and ${stats.types.fixes.length} bug fixes, you balanced building new capabilities with maintaining stability. Your work spanned ${repoCount} different repositories, demonstrating versatility and a willingness to contribute broadly.

${stats.longestStreak > 7 ? `A ${stats.longestStreak}-day coding streak shows remarkable consistency.` : `You coded consistently throughout the year.`} Whether it was early morning or late night, you showed up and shipped code.`;

  // Year in numbers insights
  const yearInNumbersInsights = [
    `${totalCommits.toLocaleString()} total commits - that's roughly ${Math.round(totalCommits/365)} commits per day on average`,
    `${repoCount} repositories touched - showing breadth of contribution`,
    `${stats.types.features.length} new features implemented`,
    `${stats.types.fixes.length} bugs squashed and issues resolved`,
    `${stats.weekendCommits} weekend commits (${Math.round(stats.weekendCommits/totalCommits*100)}% of total)`,
    `${stats.lateNightCommits} late night commits showing dedication`,
    `${stats.longestStreak} day longest coding streak`
  ];

  // Challenges - Group by repo and create meaningful descriptions
  const challengesByRepo = {};
  stats.types.fixes.forEach(c => {
    if (!challengesByRepo[c.repo]) {
      challengesByRepo[c.repo] = [];
    }
    challengesByRepo[c.repo].push(c.message);
  });

  const challengesList = Object.entries(challengesByRepo)
    .sort(([,a], [,b]) => b.length - a.length)
    .slice(0, 6)
    .map(([repo, fixes]) => {
      const repoName = repo.split('/').pop();
      if (fixes.length >= 5) {
        return `Resolved ${fixes.length} issues in ${repoName}, systematically improving stability and reliability`;
      } else if (fixes.length >= 3) {
        return `Tackled multiple bug fixes in ${repoName}, addressing critical issues and edge cases`;
      } else {
        return `Fixed issues in ${repoName}, ensuring smooth operation and user experience`;
      }
    });

  if (challengesList.length === 0) {
    challengesList.push('Maintaining code quality across multiple projects');
    challengesList.push('Balancing new features with bug fixes');
  }

  // Achievements - Group by repo and create meaningful descriptions
  const achievementsByRepo = {};
  stats.types.features.forEach(c => {
    if (!achievementsByRepo[c.repo]) {
      achievementsByRepo[c.repo] = [];
    }
    achievementsByRepo[c.repo].push(c.message);
  });

  const achievementsList = Object.entries(achievementsByRepo)
    .sort(([,a], [,b]) => b.length - a.length)
    .slice(0, 6)
    .map(([repo, features]) => {
      const repoName = repo.split('/').pop();
      if (features.length >= 5) {
        return `Built ${features.length} new features in ${repoName}, significantly expanding its capabilities`;
      } else if (features.length >= 3) {
        return `Implemented multiple new capabilities in ${repoName}, enhancing user experience`;
      } else {
        return `Added new functionality to ${repoName}, growing the project's feature set`;
      }
    });

  if (achievementsList.length === 0) {
    achievementsList.push('Consistent contribution throughout the year');
    achievementsList.push('Building and maintaining multiple repositories');
  }

  // Project spotlight
  const projectSpotlight = topRepos.slice(0, 5).map(([name, data]) => ({
    name,
    narrative: `You made ${data.count} commits to this project, making it one of your primary focuses this year.`,
    impact: `${Math.round(data.count/totalCommits*100)}% of your total commits`
  }));

  // Work style
  const pace = totalCommits > 1000 ? 'marathon' : totalCommits > 500 ? 'sprint' : totalCommits > 200 ? 'steady' : 'focused';
  const approach = stats.messageStats.detailed > stats.messageStats.oneLiner ? 'methodical' : 'pragmatic';

  // Month by month
  const peakMonths = monthlyActivity.slice(0, 3).map(([month, count]) => `${month}: ${count} commits`);
  const slowMonths = monthlyActivity.slice(-2).map(([month, count]) => `${month}: ${count} commits`);

  // Fun facts
  const funFacts = [
    `Your most productive month was ${monthlyActivity[0]?.[0] || 'consistent'} with ${monthlyActivity[0]?.[1] || 0} commits`,
    `You committed ${stats.weekendCommits} times on weekends - that's dedication!`,
    `${stats.lateNightCommits} commits were made during late night hours (10PM-4AM)`,
    `Your average commit message was ${stats.messageStats.avgLength} characters long`,
    `${stats.messageStats.detailed} commits had detailed multi-line messages`,
    stats.revertedCommits.length > 0 ? `You reverted ${stats.revertedCommits.length} commits - learning from mistakes!` : 'You rarely had to revert commits - clean coding!'
  ];

  // Quotable commits
  const quotableCommits = [
    ...stats.significantCommits.slice(0, 3).map(c => c.message),
    ...stats.types.features.slice(0, 2).map(c => c.message)
  ].slice(0, 5);

  return {
    executiveSummary,
    story,
    mainTheme: themeDescription,
    yearInNumbers: {
      headline: `${totalCommits.toLocaleString()} Commits Across ${repoCount} Repos`,
      insights: yearInNumbersInsights
    },
    biggestStruggles: {
      overview: `You tackled ${stats.types.fixes.length} bug fixes and issues this year. Every fix is a lesson learned and a step toward more robust code.`,
      challenges: challengesList
    },
    proudMoments: {
      overview: `You shipped ${stats.types.features.length} new features and improvements. Each one represents value delivered and problems solved.`,
      achievements: achievementsList
    },
    projectSpotlight: {
      overview: `Your work spanned ${repoCount} repositories, with concentrated effort on your top projects.`,
      projects: projectSpotlight
    },
    workStyle: {
      pace,
      approach,
      description: `You're a ${approach} developer who works at a ${pace} pace. With ${totalCommits} commits, you've shown ${pace === 'marathon' ? 'exceptional endurance' : pace === 'sprint' ? 'high intensity bursts' : 'consistent dedication'}. Your ${stats.messageStats.detailed > stats.messageStats.oneLiner ? 'detailed commit messages show attention to documentation' : 'concise commit style shows efficiency'}.`,
      strengths: [
        `Consistent output: ${totalCommits} commits shows reliability`,
        `Versatility: contributed to ${repoCount} different repositories`,
        featureRatio > 0.2 ? 'Strong feature development skills' : 'Excellent maintenance and stability focus',
        stats.longestStreak > 7 ? `Dedication: ${stats.longestStreak}-day coding streak` : 'Balanced work-life approach'
      ],
      growthAreas: [
        stats.types.tests.length < totalCommits * 0.1 ? 'Could explore more test coverage' : 'Testing is already a strength',
        stats.types.docs.length < totalCommits * 0.05 ? 'Documentation could be expanded' : 'Documentation is solid'
      ]
    },
    technicalEvolution: {
      narrative: `Throughout the year, you evolved your approach to development. Your commit patterns show ${stats.messageStats.detailed > stats.messageStats.oneLiner ? 'a preference for detailed, documented changes' : 'an efficient, results-focused style'}.

Working across ${repoCount} repositories required adaptability and context-switching skills. Your ${stats.types.refactors.length} refactoring commits demonstrate a commitment to code quality and continuous improvement.`,
      keyTransitions: [
        `Touched ${repoCount} different repositories`,
        `${stats.types.refactors.length} refactoring commits for code improvement`,
        `Maintained ${stats.longestStreak}-day coding consistency`
      ]
    },
    topicsExplored: [
      'Feature Development',
      'Bug Fixing',
      stats.types.refactors.length > 0 ? 'Code Refactoring' : null,
      stats.types.tests.length > 0 ? 'Testing' : null,
      stats.types.docs.length > 0 ? 'Documentation' : null,
      'Code Maintenance',
      'Repository Management'
    ].filter(Boolean),
    monthByMonth: {
      narrative: `Your activity fluctuated throughout the year, with ${monthlyActivity[0]?.[0] || 'various months'} being your most productive period.`,
      peaks: peakMonths,
      valleys: slowMonths
    },
    funFacts,
    quotableCommits: quotableCommits.length > 0 ? quotableCommits : ['Building software, one commit at a time'],
    yearAheadOutlook: `Based on your ${totalCommits} commits this year, you've built strong momentum. Consider focusing on ${stats.types.tests.length < 50 ? 'expanding test coverage' : 'maintaining your testing discipline'} and ${stats.types.docs.length < 20 ? 'adding more documentation' : 'continuing your documentation habits'}. Your versatility across ${repoCount} repos is a strength to build on.`,
    finalWords: `${totalCommits.toLocaleString()} commits. ${repoCount} repositories. One dedicated developer. Keep shipping.`,
    _rawStats: {
      total: totalCommits,
      repos: repoCount,
      fixes: stats.types.fixes.length,
      features: stats.types.features.length,
      weekendCommits: stats.weekendCommits,
      lateNightCommits: stats.lateNightCommits,
      longestStreak: stats.longestStreak,
    }
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
        insights = await analyzeCommitsWithAI(allCommits, env, token);
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
    
    // Create cache key with version to invalidate cache on releases
    const cacheKey = `wrapped:${CACHE_VERSION}:${username}:${year}${token ? ':private' : ''}`;
    
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
