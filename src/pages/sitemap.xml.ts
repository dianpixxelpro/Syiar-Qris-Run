import type { APIRoute } from 'astro';
import { getUpcomingEvents, getFinishedEvents } from '../lib/db';

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = (site || 'https://qrisrun.com').toString().replace(/\/$/, '');
  
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/events/1', priority: '0.9', changefreq: 'daily' },
    { url: '/jersey', priority: '0.8', changefreq: 'weekly' },
    { url: '/medali', priority: '0.8', changefreq: 'weekly' },
    { url: '/rute', priority: '0.8', changefreq: 'weekly' },
    { url: '/panduan', priority: '0.8', changefreq: 'weekly' },
    { url: '/regulasi', priority: '0.7', changefreq: 'monthly' },
    { url: '/kontak', priority: '0.7', changefreq: 'monthly' },
  ];

  let dynamicEventUrls: { url: string; priority: string; changefreq: string }[] = [];
  try {
    const upcoming = await getUpcomingEvents();
    const finished = await getFinishedEvents();
    const allEvents = [...upcoming, ...finished];
    
    dynamicEventUrls = allEvents
      .filter(ev => ev.id !== 1) // 1 is already in staticPages
      .map(ev => ({
        url: `/events/${ev.id}`,
        priority: '0.8',
        changefreq: 'weekly',
      }));
  } catch (e) {
    console.error('Error fetching events for sitemap:', e);
  }

  const allPages = [...staticPages, ...dynamicEventUrls];
  const lastmod = new Date().toISOString().split('T')[0];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${allPages
  .map(
    page => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
