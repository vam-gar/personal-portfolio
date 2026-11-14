// Live GitHub stats for the allowlisted repos. Unauthenticated calls share
// a 60 requests/hour limit per IP, so responses are cached for 10 minutes
// and GITHUB_TOKEN (optional, no scopes needed) raises the limit.

const API = "https://api.github.com";
const REVALIDATE_SECS = 600;

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "portfolio-bot",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`${API}${path}`, {
    headers,
    next: { revalidate: REVALIDATE_SECS },
  } as RequestInit);
  if (!r.ok) {
    const limited = r.status === 403 || r.status === 429;
    throw new Error(
      limited ? "GitHub API rate limit reached; try again later." : `GitHub API returned ${r.status}.`
    );
  }
  return (await r.json()) as T;
}

type RepoJson = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  created_at: string;
  pushed_at: string;
  default_branch: string;
};

type CommitJson = {
  sha: string;
  commit: { message: string; author: { date: string } | null };
};

export async function getRepoStats(repo: string) {
  const [info, languages, commits] = await Promise.all([
    gh<RepoJson>(`/repos/${repo}`),
    gh<Record<string, number>>(`/repos/${repo}/languages`),
    gh<CommitJson[]>(`/repos/${repo}/commits?per_page=3`),
  ]);
  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  return {
    repo: info.full_name,
    url: info.html_url,
    description: info.description,
    stars: info.stargazers_count,
    forks: info.forks_count,
    openIssues: info.open_issues_count,
    primaryLanguage: info.language,
    languages: Object.fromEntries(
      Object.entries(languages).map(([name, bytes]) => [
        name,
        `${((bytes / totalBytes) * 100).toFixed(1)}%`,
      ])
    ),
    createdAt: info.created_at,
    lastPushedAt: info.pushed_at,
    recentCommits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      date: c.commit.author?.date ?? null,
      message: c.commit.message.split("\n")[0],
    })),
    fetchedAt: new Date().toISOString(),
  };
}

type UserJson = {
  login: string;
  html_url: string;
  public_repos: number;
  followers: number;
  created_at: string;
};

export async function getProfileStats(user: string) {
  const u = await gh<UserJson>(`/users/${user}`);
  return {
    user: u.login,
    url: u.html_url,
    publicRepos: u.public_repos,
    followers: u.followers,
    memberSince: u.created_at,
    fetchedAt: new Date().toISOString(),
  };
}
