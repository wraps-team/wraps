# Website Deployment Guide

This document explains how to deploy the Wraps marketing website.

## Option 1: Vercel (Recommended)

Vercel is the recommended deployment platform for the Wraps website. It provides automatic deployments, PR previews, and a global CDN.

### Initial Setup

1. **Install Vercel CLI** (optional, for local testing):
   ```bash
   npm install -g vercel
   ```

2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "Add New Project"
   - Import your `wraps-team/wraps` repository
   - Set the root directory to `apps/website`
   - Vercel will auto-detect Vite settings

3. **Configure Build Settings**:
   - Framework Preset: `Vite`
   - Root Directory: `apps/website`
   - Build Command: `cd ../.. && pnpm build --filter=wraps-website`
   - Output Directory: `dist`
   - Install Command: `cd ../.. && pnpm install`

4. **Set Environment Variables** (if needed):
   - `VITE_BASENAME` - Base path for the app (leave empty for root)
   - `VITE_GTM_ID` - Google Tag Manager ID (optional)

5. **Configure Domain**:
   - In Vercel project settings → Domains
   - Add your custom domain (e.g., `wraps.dev` or `getwraps.dev`)
   - Follow DNS configuration instructions

### Automatic Deployments

Once connected, Vercel will automatically:
- Deploy `main` branch to production
- Deploy PRs to preview URLs
- Run builds and show deployment status in GitHub

### Manual Deployment

To deploy manually from your local machine:

```bash
cd apps/website
vercel --prod
```

### GitHub Actions (Alternative)

A GitHub Actions workflow is included at `.github/workflows/deploy-website.yml`.

**Setup GitHub Secrets:**
1. Get your Vercel token from [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Get project IDs: `vercel link` in the website directory
3. Add to GitHub repository secrets:
   - `VERCEL_TOKEN` - Your Vercel API token
   - `VERCEL_ORG_ID` - Your Vercel organization ID
   - `VERCEL_PROJECT_ID` - Your Vercel project ID

## Option 2: Netlify

Netlify is another excellent option with similar features to Vercel.

### Setup

1. Go to [netlify.com](https://netlify.com) and sign in
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub and select your repository
4. Configure build settings:
   - Base directory: `apps/website`
   - Build command: `cd ../.. && pnpm build --filter=wraps-website`
   - Publish directory: `apps/website/dist`

5. Add build environment variables:
   ```
   NODE_VERSION=20
   NPM_FLAGS=--prefix=../..
   ```

6. Add `netlify.toml` to `apps/website/`:
   ```toml
   [build]
     base = "apps/website"
     command = "cd ../.. && pnpm install && pnpm --filter wraps-website build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

## Option 3: Cloudflare Pages

Fast and with a generous free tier.

### Setup

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Connect to GitHub repository
3. Configure build:
   - Build command: `cd ../.. && pnpm install && pnpm --filter wraps-website build`
   - Build output directory: `apps/website/dist`
   - Root directory: `/` (leave as root)
   - Environment variable: `NODE_VERSION=20`

## Option 4: Self-Hosted (AWS S3 + CloudFront)

For full control, host on AWS infrastructure.

### Setup

1. **Build the site locally**:
   ```bash
   pnpm --filter wraps-website build
   ```

2. **Create S3 bucket**:
   ```bash
   aws s3 mb s3://wraps-website
   aws s3 website s3://wraps-website --index-document index.html
   ```

3. **Upload files**:
   ```bash
   cd apps/website/dist
   aws s3 sync . s3://wraps-website --delete
   ```

4. **Create CloudFront distribution**:
   - Origin: Your S3 bucket
   - Viewer Protocol Policy: Redirect HTTP to HTTPS
   - Default Root Object: `index.html`
   - Error Pages: 404 → /index.html (for client-side routing)

5. **Automate with GitHub Actions** (see `.github/workflows/deploy-s3.yml` example below)

## Performance Optimization

### Before Deploying

1. **Optimize images**:
   ```bash
   # Install sharp for image optimization
   pnpm add -D @squoosh/cli

   # Optimize images in public directory
   npx @squoosh/cli --output-dir public/optimized public/*.{jpg,png}
   ```

2. **Enable compression** (handled by Vercel/Netlify automatically)

3. **Check bundle size**:
   ```bash
   pnpm --filter wraps-website build
   # Check dist/ folder size
   ```

### After Deploying

1. **Test with Lighthouse**:
   - Open Chrome DevTools → Lighthouse
   - Run audit on production URL
   - Aim for 90+ scores

2. **Monitor Core Web Vitals**:
   - Use Google PageSpeed Insights
   - Check Vercel Analytics (if using Vercel)

## Custom Domain Setup

### DNS Configuration

For `wraps.dev` (or your domain):

**For Vercel:**
```
Type    Name    Value
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
```

**For Netlify:**
```
Type    Name    Value
A       @       75.2.60.5
CNAME   www     your-site.netlify.app
```

**For Cloudflare Pages:**
```
Type    Name    Value
CNAME   @       your-site.pages.dev
CNAME   www     your-site.pages.dev
```

## Monitoring

### Recommended Tools

1. **Uptime Monitoring**: [Uptime Robot](https://uptimerobot.com) (free)
2. **Analytics**:
   - Vercel Analytics (built-in if using Vercel)
   - Plausible Analytics (privacy-friendly)
   - Google Analytics (via GTM_ID env var)
3. **Error Tracking**: [Sentry](https://sentry.io) (optional)

## Troubleshooting

### Build Fails

**Issue**: Build fails with module not found
**Solution**: Make sure all dependencies are in the correct package.json

```bash
cd apps/website
pnpm install
pnpm build
```

**Issue**: Build works locally but fails on Vercel
**Solution**: Check Node version matches (20+)

### Routing Issues

**Issue**: 404 on page refresh (e.g., /docs/quickstart)
**Solution**: Ensure SPA rewrites are configured (see `vercel.json`)

### Images Not Loading

**Issue**: Images return 404
**Solution**: Images must be in `public/` directory and referenced without `/public` prefix

```tsx
// ✅ Correct
<img src="/logo.png" />

// ❌ Wrong
<img src="/public/logo.png" />
```

## Rollback

If a deployment breaks production:

**Vercel**:
1. Go to project → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

**Netlify**:
1. Go to Deploys
2. Find last working deploy
3. Click "Publish deploy"

**Manual**:
```bash
git revert HEAD
git push origin main
```

## Next Steps

After successful deployment:

1. ✅ Set up custom domain
2. ✅ Configure SSL/TLS (automatic with Vercel/Netlify)
3. ✅ Add DNS records for email (SPF, DKIM, DMARC)
4. ✅ Test all pages and links
5. ✅ Run Lighthouse audit
6. ✅ Set up monitoring
7. ✅ Add sitemap.xml for SEO
8. ✅ Submit to Google Search Console

## Support

If you run into issues:
- Check [Vercel Docs](https://vercel.com/docs)
- Check [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- Open an issue in the Wraps repository
