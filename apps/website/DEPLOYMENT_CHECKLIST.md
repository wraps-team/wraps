# Website Deployment Checklist

Use this checklist when deploying the Wraps website to production.

## Pre-Deployment

### Code Quality
- [ ] All tests pass: `pnpm test`
- [ ] Type checking passes: `pnpm --filter wraps-website typecheck`
- [ ] Linting passes: `pnpm --filter wraps-website lint`
- [ ] Build succeeds: `pnpm --filter wraps-website build`
- [ ] Preview works locally: `pnpm --filter wraps-website preview`

### Content Review
- [ ] All links work (marketing pages, docs, external links)
- [ ] All images load correctly
- [ ] No placeholder text or "Lorem ipsum"
- [ ] Documentation is accurate and up-to-date
- [ ] Pricing information is correct
- [ ] GitHub repository links point to correct repos
- [ ] npm package links are correct (@wraps.dev/email)

### SEO & Metadata
- [ ] Page titles are set correctly
- [ ] Meta descriptions added to key pages
- [ ] OpenGraph images configured
- [ ] Favicon exists in public/
- [ ] robots.txt configured (if needed)
- [ ] sitemap.xml exists (if needed)

### Performance
- [ ] Images optimized (use WebP where possible)
- [ ] Bundle size is reasonable (<500KB gzipped)
- [ ] No console errors or warnings
- [ ] Lighthouse score >90 for all categories

### Legal & Compliance
- [ ] Privacy policy linked (if collecting analytics)
- [ ] Terms of service linked
- [ ] Cookie consent banner (if using cookies)
- [ ] GDPR compliance (if targeting EU)

## Vercel Deployment

### Initial Setup
- [ ] Vercel account created/connected
- [ ] Repository connected to Vercel
- [ ] Project settings configured:
  - [ ] Root directory: `apps/website`
  - [ ] Build command: `cd ../.. && pnpm build --filter=wraps-website`
  - [ ] Output directory: `dist`
  - [ ] Install command: `cd ../.. && pnpm install`
  - [ ] Node version: 20

### Environment Variables
- [ ] `VITE_GTM_ID` set (if using Google Tag Manager)
- [ ] Any other required env vars configured

### Domain Configuration
- [ ] Custom domain added in Vercel
- [ ] DNS records configured:
  - [ ] A record for apex domain (@)
  - [ ] CNAME for www subdomain
- [ ] SSL certificate issued (automatic)
- [ ] Domain redirects configured (e.g., www → non-www)

## Post-Deployment

### Functional Testing
- [ ] Homepage loads correctly
- [ ] All navigation links work
- [ ] Docs pages accessible:
  - [ ] /docs
  - [ ] /docs/quickstart
  - [ ] /docs/sdk-reference
  - [ ] /docs/cli-reference
- [ ] Pricing section displays correctly
- [ ] FAQ accordion works
- [ ] Contact forms work (if applicable)
- [ ] Mobile responsive design works
- [ ] Dark/light mode toggle works

### Performance Testing
- [ ] Run Lighthouse audit on production URL
- [ ] Check Core Web Vitals in PageSpeed Insights
- [ ] Test page load times from different locations
- [ ] Verify CDN is serving assets correctly

### SEO Testing
- [ ] Google Search Console configured
- [ ] Submit sitemap to Google
- [ ] Test Google indexing: `site:yourdomain.com`
- [ ] Verify OpenGraph preview on Twitter/LinkedIn
- [ ] Check structured data (if implemented)

### Analytics & Monitoring
- [ ] Analytics tracking confirmed (if configured)
- [ ] Error tracking configured (Sentry, if using)
- [ ] Uptime monitoring configured
- [ ] Set up alerts for downtime

### Marketing
- [ ] Update GitHub README with website link
- [ ] Update CLI help text with website link
- [ ] Update npm package docs with website link
- [ ] Announce on Twitter/X
- [ ] Post on Product Hunt (if launching)
- [ ] Share on Hacker News (if appropriate)
- [ ] Update LinkedIn/personal profiles

## Rollback Plan

If something goes wrong:

1. **Immediate rollback in Vercel**:
   - Go to Deployments
   - Find last working deployment
   - Click "Promote to Production"

2. **Code rollback**:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Emergency contact**:
   - Have Vercel support link ready
   - Know where deployment logs are

## Continuous Deployment

Once initial deployment is complete:

- [ ] Every push to `main` auto-deploys
- [ ] PRs get preview deployments
- [ ] Deployment status shows in GitHub
- [ ] Team has access to Vercel project

## Monthly Maintenance

- [ ] Check for broken links
- [ ] Update dependencies: `pnpm update`
- [ ] Review analytics for user behavior
- [ ] Check Lighthouse scores
- [ ] Review and respond to GitHub issues about docs
- [ ] Update content as product evolves

## Notes

Add any deployment-specific notes here:

```
- Production URL: https://wraps.dev
- Vercel Project: [Add link]
- Analytics Dashboard: [Add link]
- Status Page: [Add link if you set one up]
```

## Support

If you need help:
- Vercel Support: https://vercel.com/support
- Vite Docs: https://vitejs.dev
- Internal team: [Add contact info]
