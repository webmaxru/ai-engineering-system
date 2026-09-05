import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { repositoryDocsIntegration } from './scripts/sync-docs.mjs';

export default defineConfig({
  site: 'https://webmaxru.github.io',
  base: '/ai-engineering-system/',
  trailingSlash: 'always',
  integrations: [
    repositoryDocsIntegration(),
    sitemap(),
    starlight({
      title: 'AI Engineering System',
      description:
        'A practical, inspectable control loop for agent-assisted software delivery.',
      social: [
        {
          icon: 'github',
          label: 'GitHub repository',
          href: 'https://github.com/webmaxru/ai-engineering-system',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      pagination: true,
      sidebar: [
        {
          label: 'About',
          items: [{ label: 'About this system', slug: 'about' }],
        },
        {
          label: 'Documentation',
          items: [
            {
              autogenerate: {
                directory: 'reference',
              },
            },
          ],
        },
      ],
    }),
  ],
});
