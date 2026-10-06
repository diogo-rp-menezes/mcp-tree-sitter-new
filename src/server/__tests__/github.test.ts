import { describe, it, expect } from 'vitest';
import { parseGitHubRepo } from '../github';

describe('GitHub Repository URL Parser', () => {
  it('parses shorthand "owner/repo" correctly', () => {
    const res = parseGitHubRepo('octocat/Hello-World');
    expect(res).toEqual({ owner: 'octocat', repo: 'Hello-World' });
  });

  it('parses full HTTPS GitHub URLs', () => {
    const res = parseGitHubRepo('https://github.com/expressjs/express');
    expect(res).toEqual({ owner: 'expressjs', repo: 'express' });
  });

  it('handles .git suffix and trailing slashes in URLs', () => {
    const res1 = parseGitHubRepo('https://github.com/facebook/react.git');
    expect(res1).toEqual({ owner: 'facebook', repo: 'react' });

    const res2 = parseGitHubRepo('http://www.github.com/pallets/flask/');
    expect(res2).toEqual({ owner: 'pallets', repo: 'flask' });
  });

  it('parses SSH Git URLs', () => {
    const res = parseGitHubRepo('git@github.com:rust-lang/rust.git');
    expect(res).toEqual({ owner: 'rust-lang', repo: 'rust' });
  });

  it('returns null for invalid or non-GitHub URLs', () => {
    expect(parseGitHubRepo('')).toBeNull();
    expect(parseGitHubRepo('not-a-repo')).toBeNull();
    expect(parseGitHubRepo('https://gitlab.com/user/project')).toBeNull();
    expect(parseGitHubRepo('https://google.com')).toBeNull();
  });

  it('correctly extracts owner and repo without trailing query strings or hash', () => {
    const res = parseGitHubRepo('https://github.com/expressjs/express/tree/master/lib');
    expect(res).toEqual({ owner: 'expressjs', repo: 'express' });
  });
});
