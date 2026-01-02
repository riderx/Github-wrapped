/**
 * GitHub Wrapped Workflow
 * Uses Cloudflare Workflows for durable, long-running commit fetching
 * No limits - fetches ALL commits across ALL repositories
 */

import { WorkflowEntrypoint } from 'cloudflare:workers';

/**
 * Fetch GitHub API with authentication
 */
async function fetchGitHub(url, token) {
  const headers = {
    'User-Agent': 'GitHub-Wrapped',
    'Accept': 'application/vnd.github.cloak-preview+json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = new Error(`GitHub API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Search commits for a specific date range
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
        if (response.status === 403 || response.status === 422) {
          incomplete = true;
          break;
        }
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

      if (page >= 10 && totalCount > 1000) {
        incomplete = true;
        break;
      }

      if (items.length < 100) break;
      page++;
    } catch (error) {
      console.error(`Error searching commits for ${dateRange}:`, error.message);
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
 * GitHub Wrapped Workflow - fetches ALL commits with no limits
 */
export class GitHubWrappedWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { username, year, token } = event.payload;

    console.log(`[Workflow] Starting for ${username}, year ${year}`);

    // Step 1: Get user info
    const userInfo = await step.do(
      'fetch-user-info',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        return await fetchGitHub(`https://api.github.com/users/${username}`, token);
      }
    );

    // Collect all commits across all months
    let allCommits = [];
    const seenShas = new Set();

    // Step 2-13: Fetch commits for each month
    for (let month = 1; month <= 12; month++) {
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${monthStr}-${lastDay}`;

      const monthCommits = await step.do(
        `fetch-commits-month-${month}`,
        {
          retries: { limit: 5, delay: '5 seconds', backoff: 'exponential' },
          timeout: '5 minutes',
        },
        async () => {
          console.log(`[Workflow] Fetching commits for ${startDate} to ${endDate}`);

          let result = await searchCommitsInRange(username, startDate, endDate, token);

          // If we hit the limit, split into smaller ranges
          if (result.incomplete && result.totalCount > 1000) {
            console.log(`[Workflow] Month ${month} has ${result.totalCount} commits, splitting...`);
            result = { commits: [], totalCount: 0, incomplete: false };
            const days = getDaysInRange(startDate, endDate);

            // Split into weeks
            for (let i = 0; i < days.length; i += 7) {
              const weekStart = days[i];
              const weekEnd = days[Math.min(i + 6, days.length - 1)];
              let weekResult = await searchCommitsInRange(username, weekStart, weekEnd, token);

              if (weekResult.incomplete && weekResult.totalCount > 1000) {
                // Go day by day
                for (let d = i; d <= Math.min(i + 6, days.length - 1); d++) {
                  const dayResult = await searchCommitsInRange(username, days[d], days[d], token);
                  result.commits.push(...dayResult.commits);
                }
              } else {
                result.commits.push(...weekResult.commits);
              }
            }
          }

          return result.commits;
        }
      );

      // Deduplicate and add commits
      for (const commit of monthCommits) {
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha);
          allCommits.push(commit);
        }
      }

      console.log(`[Workflow] Total commits so far: ${allCommits.length}`);
    }

    console.log(`[Workflow] Found ${allCommits.length} total commits`);

    // Step 14: Analyze commits
    const analysis = await step.do('analyze-commits', async () => {
      return analyzeCommitsForWorkflow(allCommits);
    });

    // Step 15: Fetch repo details for top repos
    const repoDetails = await step.do(
      'fetch-repo-details',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '5 minutes',
      },
      async () => {
        const details = [];
        const topRepos = analysis.repoStats.slice(0, 50);

        for (const repo of topRepos) {
          try {
            const info = await fetchGitHub(`https://api.github.com/repos/${repo.fullName}`, token);
            details.push({
              fullName: repo.fullName,
              stars: info.stargazers_count || 0,
              language: info.language,
            });
          } catch (error) {
            details.push({
              fullName: repo.fullName,
              stars: 0,
              language: null,
            });
          }
        }

        return details;
      }
    );

    // Step 16: Get PR count using Search API (accurate for full year)
    const pullRequestCount = await step.do(
      'fetch-pr-count',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        try {
          const query = `author:${username} type:pr created:${year}-01-01..${year}-12-31`;
          const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`;
          const result = await fetchGitHub(url, token);
          console.log(`[Workflow] User ${username} has ${result.total_count} PRs in ${year}`);
          return result.total_count || 0;
        } catch {
          return 0;
        }
      }
    );

    // Step 17: Get issue count using Search API (accurate for full year)
    const issueCount = await step.do(
      'fetch-issue-count',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        try {
          const query = `author:${username} type:issue created:${year}-01-01..${year}-12-31`;
          const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`;
          const result = await fetchGitHub(url, token);
          console.log(`[Workflow] User ${username} has ${result.total_count} issues in ${year}`);
          return result.total_count || 0;
        } catch {
          return 0;
        }
      }
    );

    // Step 18: Get review count using Search API (accurate for full year)
    const reviewCount = await step.do(
      'fetch-review-count',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        try {
          const query = `reviewed-by:${username} type:pr created:${year}-01-01..${year}-12-31`;
          const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`;
          const result = await fetchGitHub(url, token);
          console.log(`[Workflow] User ${username} reviewed ${result.total_count} PRs in ${year}`);
          return result.total_count || 0;
        } catch {
          return 0;
        }
      }
    );

    // Merge repo details with stats
    const repoContributions = analysis.repoStats.map((repo) => {
      const details = repoDetails.find((d) => d.fullName === repo.fullName) || {};
      return {
        ...repo,
        stars: details.stars || 0,
        language: details.language || null,
      };
    });

    // Calculate language stats
    const languageStats = {};
    for (const repo of repoContributions) {
      if (repo.language) {
        languageStats[repo.language] = (languageStats[repo.language] || 0) + repo.commits;
      }
    }

    const topLanguages = Object.entries(languageStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([language, commits]) => ({ language, commits }));

    // Build the final result
    const result = {
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
        totalCommits: allCommits.length,
        pullRequests: pullRequestCount,
        issues: issueCount,
        reviews: reviewCount,
        repositoriesContributed: repoContributions.length,
        topRepositories: repoContributions.slice(0, 10),
        allRepositories: repoContributions,
        topLanguages,
        commitTypes: analysis.commitTypes,
      },
      repoHighlights: buildRepoHighlights(repoContributions),
      timeAnalysis: analysis.timeAnalysis,
      streaks: analysis.streaks,
      allCommits: allCommits.map((c) => ({
        message: c.message.split('\n')[0],
        date: c.date,
        repo: c.repo,
      })),
      generatedAt: new Date().toISOString(),
    };

    return result;
  }
}

/**
 * Analyze commits for the workflow
 */
function analyzeCommitsForWorkflow(commits) {
  const repoMap = new Map();
  const hourlyActivity = new Array(24).fill(0);
  const dailyActivity = new Array(7).fill(0);
  const monthlyActivity = new Array(12).fill(0);
  const commitsByDate = new Map();

  const bugKeywords = ['fix', 'bug', 'issue', 'error', 'problem', 'broken', 'failing', 'debug', 'revert', 'hotfix', 'patch', 'crash', 'workaround'];
  const featureKeywords = ['add', 'implement', 'create', 'new', 'feature', 'support', 'enable', 'introduce'];
  const refactorKeywords = ['refactor', 'cleanup', 'improve', 'optimize', 'reorganize', 'simplify', 'restructure', 'rename', 'move'];

  let totalFixes = 0;
  let totalFeatures = 0;
  let totalRefactors = 0;

  for (const commit of commits) {
    const repoName = commit.repo;
    const date = new Date(commit.date);
    const dateStr = date.toISOString().split('T')[0];
    const msg = commit.message.toLowerCase();

    commitsByDate.set(dateStr, (commitsByDate.get(dateStr) || 0) + 1);
    hourlyActivity[date.getUTCHours()]++;
    dailyActivity[date.getUTCDay()]++;
    monthlyActivity[date.getUTCMonth()]++;

    let category = 'other';
    if (bugKeywords.some((kw) => msg.includes(kw))) {
      category = 'fix';
      totalFixes++;
    } else if (featureKeywords.some((kw) => msg.includes(kw))) {
      category = 'feature';
      totalFeatures++;
    } else if (refactorKeywords.some((kw) => msg.includes(kw))) {
      category = 'refactor';
      totalRefactors++;
    }

    if (!repoMap.has(repoName)) {
      repoMap.set(repoName, {
        name: repoName.split('/')[1] || repoName,
        fullName: repoName,
        commits: 0,
        fixes: 0,
        features: 0,
        refactors: 0,
        firstCommit: date,
        lastCommit: date,
        activeDays: new Set(),
      });
    }

    const repo = repoMap.get(repoName);
    repo.commits++;
    if (category === 'fix') repo.fixes++;
    if (category === 'feature') repo.features++;
    if (category === 'refactor') repo.refactors++;
    repo.activeDays.add(dateStr);
    if (date < repo.firstCommit) repo.firstCommit = date;
    if (date > repo.lastCommit) repo.lastCommit = date;
  }

  // Calculate per-repo metrics
  const repoStats = [];
  for (const [, repo] of repoMap) {
    const daySpan = Math.max(1, Math.ceil((repo.lastCommit - repo.firstCommit) / (1000 * 60 * 60 * 24)));
    const activeDaysCount = repo.activeDays.size;

    repoStats.push({
      name: repo.name,
      fullName: repo.fullName,
      commits: repo.commits,
      fixes: repo.fixes,
      features: repo.features,
      refactors: repo.refactors,
      problemRatio: repo.fixes / repo.commits,
      velocity: repo.commits / daySpan,
      blitzScore: (repo.commits / activeDaysCount) * (1 - activeDaysCount / Math.max(daySpan, 1)),
      activeDays: activeDaysCount,
    });
  }

  repoStats.sort((a, b) => b.commits - a.commits);

  // Calculate streaks
  const sortedDates = Array.from(commitsByDate.keys()).sort();
  let longestStreak = 0;
  let longestStreakStart = null;
  let longestStreakEnd = null;
  let currentStreak = 0;
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

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestStreakStart = tempStreakStart;
    longestStreakEnd = sortedDates[sortedDates.length - 1];
  }

  // Time analysis
  const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
  const peakDay = dailyActivity.indexOf(Math.max(...dailyActivity));
  const peakMonth = monthlyActivity.indexOf(Math.max(...monthlyActivity));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const weekendCommits = dailyActivity[0] + dailyActivity[6];
  const weekdayCommits = dailyActivity.slice(1, 6).reduce((a, b) => a + b, 0);
  const nightCommits = hourlyActivity.slice(22, 24).reduce((a, b) => a + b, 0) + hourlyActivity.slice(0, 6).reduce((a, b) => a + b, 0);
  const morningCommits = hourlyActivity.slice(6, 12).reduce((a, b) => a + b, 0);
  const afternoonCommits = hourlyActivity.slice(12, 18).reduce((a, b) => a + b, 0);
  const eveningCommits = hourlyActivity.slice(18, 22).reduce((a, b) => a + b, 0);

  let codingStyle = 'balanced';
  if (nightCommits > Math.max(morningCommits, afternoonCommits, eveningCommits)) codingStyle = 'night-owl';
  else if (morningCommits > Math.max(afternoonCommits, eveningCommits)) codingStyle = 'early-bird';
  else if (eveningCommits > afternoonCommits) codingStyle = 'evening-coder';

  return {
    repoStats,
    commitTypes: {
      fixes: totalFixes,
      features: totalFeatures,
      refactors: totalRefactors,
      other: commits.length - totalFixes - totalFeatures - totalRefactors,
    },
    timeAnalysis: {
      peakHour: `${peakHour}:00 - ${peakHour + 1}:00 UTC`,
      peakDay: dayNames[peakDay],
      peakMonth: monthNames[peakMonth],
      codingStyle,
      isWeekendWarrior: weekendCommits > weekdayCommits * 0.5,
      weekendCommits,
      weekdayCommits,
      hourlyActivity,
      dailyActivity,
      monthlyActivity,
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
 * Build repo highlights from contributions
 */
function buildRepoHighlights(repoContributions) {
  const mostActiveRepo = repoContributions[0] || null;

  const mostProblematicRepo = [...repoContributions]
    .filter((r) => r.fixes > 3)
    .sort((a, b) => b.problemRatio - a.problemRatio)[0] || null;

  const blitzRepo = [...repoContributions]
    .filter((r) => r.commits > 10)
    .sort((a, b) => b.blitzScore - a.blitzScore)[0] || null;

  const mostFeatureRepo = [...repoContributions]
    .sort((a, b) => b.features - a.features)[0] || null;

  const steadiestRepo = [...repoContributions]
    .filter((r) => r.activeDays > 5)
    .sort((a, b) => b.activeDays - a.activeDays)[0] || null;

  return {
    mostActive: mostActiveRepo
      ? {
          name: mostActiveRepo.fullName,
          commits: mostActiveRepo.commits,
          description: `Your most active repo with ${mostActiveRepo.commits} commits`,
        }
      : null,
    mostProblematic: mostProblematicRepo
      ? {
          name: mostProblematicRepo.fullName,
          fixes: mostProblematicRepo.fixes,
          problemRatio: Math.round(mostProblematicRepo.problemRatio * 100),
          description: `${Math.round(mostProblematicRepo.problemRatio * 100)}% of commits were bug fixes`,
        }
      : null,
    blitzRepo: blitzRepo
      ? {
          name: blitzRepo.fullName,
          commits: blitzRepo.commits,
          activeDays: blitzRepo.activeDays,
          description: `Intense bursts of activity - ${blitzRepo.commits} commits in just ${blitzRepo.activeDays} days`,
        }
      : null,
    mostFeatures: mostFeatureRepo
      ? {
          name: mostFeatureRepo.fullName,
          features: mostFeatureRepo.features,
          description: `Your feature factory with ${mostFeatureRepo.features} new features`,
        }
      : null,
    steadiest: steadiestRepo
      ? {
          name: steadiestRepo.fullName,
          activeDays: steadiestRepo.activeDays,
          description: `Consistent work over ${steadiestRepo.activeDays} days`,
        }
      : null,
  };
}
