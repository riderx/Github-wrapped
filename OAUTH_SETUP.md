# OAuth Setup Guide

This guide will help you set up GitHub OAuth for the GitHub Wrapped application.

## Prerequisites

1. A GitHub account
2. Cloudflare Workers account (for deployment)

## Steps to Set Up OAuth

### 1. Create a GitHub OAuth App

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: GitHub Wrapped (or your preferred name)
   - **Homepage URL**: Your deployed worker URL (e.g., `https://github-wrapped.your-subdomain.workers.dev`)
   - **Authorization callback URL**: `https://your-app-url/api/oauth/callback`
   - **Application description**: (optional) A beautiful visualization of your GitHub activity
4. Click "Register application"
5. Note down the **Client ID**
6. Click "Generate a new client secret" and note it down (you won't be able to see it again)

### 2. Configure Cloudflare Worker Secrets

For production deployment, use Wrangler secrets:

```bash
# Navigate to your project directory
cd path/to/Github-wrapped

# Set the GitHub OAuth Client ID
wrangler secret put GITHUB_CLIENT_ID
# When prompted, paste your Client ID

# Set the GitHub OAuth Client Secret
wrangler secret put GITHUB_CLIENT_SECRET
# When prompted, paste your Client Secret

# Set your application URL
wrangler secret put APP_URL
# When prompted, enter your deployed URL (e.g., https://github-wrapped.your-subdomain.workers.dev)
```

### 3. Local Development (Optional)

For local development, you can use `wrangler.toml` with `[vars]` section (DO NOT commit secrets):

```toml
[vars]
GITHUB_CLIENT_ID = "your_client_id_here"
APP_URL = "http://localhost:8787"

# IMPORTANT: Use wrangler secret for CLIENT_SECRET, even in dev
# Run: wrangler secret put GITHUB_CLIENT_SECRET --env development
```

Or use environment variables:

```bash
# Create a .dev.vars file (add to .gitignore)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
APP_URL=http://localhost:8787
```

### 4. Test the Setup

1. Deploy your worker:
   ```bash
   npm run deploy
   ```

2. Visit your deployed URL

3. Click "Sign in with GitHub"

4. Authorize the application

5. You should be redirected back to your app and see your GitHub username

## Troubleshooting

### "OAuth not configured" error
- Make sure you've set both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Verify the secrets are set correctly using `wrangler secret list`

### "Invalid redirect_uri" error
- Ensure the callback URL in your GitHub OAuth App matches exactly: `https://your-app-url/api/oauth/callback`
- Make sure `APP_URL` is set correctly in your worker environment

### "Invalid state parameter" error
- This is a CSRF protection feature
- Clear your browser cookies and try again
- If the problem persists, check your browser's cookie settings

### OAuth works but can't see data
- Make sure you're authenticated (check for user header at the top)
- Try leaving the username field empty to see your own stats
- Check browser console for any errors

## Security Best Practices

1. **Never commit secrets** to your repository
2. Use Cloudflare Secrets for production (`wrangler secret put`)
3. Use `.dev.vars` file for local development (add to `.gitignore`)
4. Regularly rotate your OAuth secrets
5. Only request the minimum required OAuth scopes (currently `read:user`)

## Additional Configuration

### Optional Environment Variables

- `OAUTH_REDIRECT_URI`: Override the default callback URL if needed
- `GITHUB_TOKEN`: Fallback token for unauthenticated requests (useful for CI/CD)

### Updating Secrets

To update a secret:

```bash
wrangler secret put SECRET_NAME
```

To delete a secret:

```bash
wrangler secret delete SECRET_NAME
```

To list all secrets (values are hidden):

```bash
wrangler secret list
```

## Support

If you encounter any issues:

1. Check the [GitHub OAuth documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
2. Review the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
3. Open an issue on the GitHub repository
