/**
 * GitHub Wrapped - Local Git-based commit fetching
 * Uses isomorphic-git + node:fs to clone repos directly in the Worker
 * NO RATE LIMITS - NO CONTAINERS - Just pure JavaScript git
 */

import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import * as fs from 'node:fs';

/**
 * Get all repos a user contributed to using GraphQL API (5000 req/hour limit)
 */
async function getUserContributedRepos(username, year, token) {
  const startDate = `${year}-01-01T00:00:00Z`;
  const endDate = `${year}-12-31T23:59:59Z`;

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!, $cursor: String) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          commitContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
              isPrivate
              defaultBranchRef {
                name
              }
            }
            contributions {
              totalCount
            }
          }
        }
        repositoriesContributedTo(first: 100, after: $cursor, contributionTypes: [COMMIT]) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            nameWithOwner
            isPrivate
            defaultBranchRef {
              name
            }
          }
        }
      }
    }
  `;

  const repos = new Map();
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GitHub-Wrapped',
      },
      body: JSON.stringify({
        query,
        variables: { username, from: startDate, to: endDate, cursor },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const user = data.data?.user;
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    // Add repos from contributionsCollection
    for (const contrib of user.contributionsCollection?.commitContributionsByRepository || []) {
      const repo = contrib.repository;
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, {
          fullName: repo.nameWithOwner,
          isPrivate: repo.isPrivate,
          defaultBranch: repo.defaultBranchRef?.name || 'main',
          commitCount: contrib.contributions?.totalCount || 0,
        });
      }
    }

    // Add repos from repositoriesContributedTo
    for (const repo of user.repositoriesContributedTo?.nodes || []) {
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, {
          fullName: repo.nameWithOwner,
          isPrivate: repo.isPrivate,
          defaultBranch: repo.defaultBranchRef?.name || 'main',
          commitCount: 0,
        });
      }
    }

    hasNextPage = user.repositoriesContributedTo?.pageInfo?.hasNextPage || false;
    cursor = user.repositoriesContributedTo?.pageInfo?.endCursor || null;

    if (repos.size > 500) break; // Safety limit
  }

  console.log(`[GraphQL] Found ${repos.size} repos for ${username}`);
  return Array.from(repos.values());
}

/**
 * Clone a repo and extract commits using isomorphic-git
 */
async function getCommitsFromRepo(repoFullName, username, year, token) {
  const repoDir = `/tmp/repos/${repoFullName.replace('/', '_')}`;
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  try {
    // Create directory
    await fs.promises.mkdir(repoDir, { recursive: true });

    const cloneUrl = `https://github.com/${repoFullName}.git`;

    console.log(`[Git] Cloning ${repoFullName}...`);

    // Clone with isomorphic-git (shallow clone, single branch)
    await git.clone({
      fs,
      http,
      dir: repoDir,
      url: cloneUrl,
      singleBranch: true,
      depth: 1, // Start shallow
      noCheckout: true, // Don't checkout files, just get history
      onAuth: () => token ? { username: 'x-access-token', password: token } : undefined,
    });

    // Fetch full history for the date range we care about
    await git.fetch({
      fs,
      http,
      dir: repoDir,
      url: cloneUrl,
      depth: null, // Get full history
      since: startDate,
      onAuth: () => token ? { username: 'x-access-token', password: token } : undefined,
    });

    // Get all commits
    const commits = [];
    const log = await git.log({
      fs,
      dir: repoDir,
      ref: 'HEAD',
    });

    for (const entry of log) {
      const commit = entry.commit;
      const commitDate = new Date(commit.committer.timestamp * 1000);

      // Filter by date range
      if (commitDate < startDate || commitDate > endDate) continue;

      // Filter by author (check both author and committer email/name)
      const authorMatch =
        commit.author.name.toLowerCase().includes(username.toLowerCase()) ||
        commit.author.email.toLowerCase().includes(username.toLowerCase()) ||
        commit.committer.name.toLowerCase().includes(username.toLowerCase()) ||
        commit.committer.email.toLowerCase().includes(username.toLowerCase());

      if (!authorMatch) continue;

      commits.push({
        sha: entry.oid,
        message: commit.message,
        date: commitDate.toISOString(),
        repo: repoFullName,
        authorName: commit.author.name,
        authorEmail: commit.author.email,
        url: `https://github.com/${repoFullName}/commit/${entry.oid}`,
      });
    }

    console.log(`[Git] Found ${commits.length} commits in ${repoFullName}`);

    // Cleanup to free memory
    await fs.promises.rm(repoDir, { recursive: true, force: true });

    return commits;
  } catch (error) {
    console.error(`[Git] Error processing ${repoFullName}:`, error.message);
    // Cleanup on error
    try {
      await fs.promises.rm(repoDir, { recursive: true, force: true });
    } catch {}
    return [];
  }
}

/**
 * Fetch ALL commits for a user using local git clones
 * NO API RATE LIMITS - uses isomorphic-git in the Worker
 */
export async function fetchCommitsWithLocalGit(username, year, token) {
  console.log(`[LocalGit] Starting commit fetch for ${username} in ${year}`);

  // Ensure /tmp/repos exists
  await fs.promises.mkdir('/tmp/repos', { recursive: true });

  // Step 1: Get list of repos (uses GraphQL - fast, 5000/hour)
  const repos = await getUserContributedRepos(username, year, token);
  console.log(`[LocalGit] Will process ${repos.length} repositories`);

  if (repos.length === 0) {
    return { commits: [], repos: [] };
  }

  // Step 2: Clone each repo and extract commits
  // Process sequentially to avoid memory issues (each clone uses memory)
  const allCommits = [];
  const repoStats = [];

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    console.log(`[LocalGit] Processing ${i + 1}/${repos.length}: ${repo.fullName}`);

    try {
      const commits = await getCommitsFromRepo(repo.fullName, username, year, token);
      allCommits.push(...commits);

      if (commits.length > 0) {
        repoStats.push({
          fullName: repo.fullName,
          commits: commits.length,
          isPrivate: repo.isPrivate,
        });
      }
    } catch (error) {
      console.error(`[LocalGit] Error with ${repo.fullName}:`, error.message);
    }
  }

  console.log(`[LocalGit] Complete! Found ${allCommits.length} total commits across ${repoStats.length} repos`);

  return { commits: allCommits, repos: repoStats };
}

/**
 * Alternative: Use per-repo commits API (faster than search, no 1000 limit per query)
 * This is a fallback if git cloning is too slow for large repos
 */
export async function fetchCommitsPerRepoAPI(username, year, token, repos) {
  const allCommits = [];
  const startDate = `${year}-01-01T00:00:00Z`;
  const endDate = `${year}-12-31T23:59:59Z`;

  for (const repo of repos) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        // This endpoint has 5000/hour rate limit (not 30/min like search)
        const url = `https://api.github.com/repos/${repo.fullName}/commits?author=${username}&since=${startDate}&until=${endDate}&per_page=100&page=${page}`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'GitHub-Wrapped',
            'Accept': 'application/vnd.github.v3+json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) break; // Repo deleted or no access
          console.error(`[API] Error for ${repo.fullName}: ${response.status}`);
          break;
        }

        const commits = await response.json();

        for (const commit of commits) {
          allCommits.push({
            sha: commit.sha,
            message: commit.commit.message,
            date: commit.commit.committer?.date || commit.commit.author?.date,
            repo: repo.fullName,
            url: commit.html_url,
          });
        }

        hasMore = commits.length === 100;
        page++;

        // Small delay to be nice (but this endpoint has much higher limits)
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`[API] Error processing ${repo.fullName}:`, error.message);
        break;
      }
    }
  }

  return allCommits;
}
