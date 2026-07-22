import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'fireflyiii-mcp',
  description:
    'Connect any MCP-compatible AI assistant to your Firefly III personal finance instance.',
  base: '/fireflyiii-mcp/',
  srcExclude: ['superpowers/**'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/tools' },
      { text: 'Contributing', link: '/contributing/' },
      { text: 'GitHub', link: 'https://github.com/daften/fireflyiii-mcp' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/guide/' },
            { text: 'npm + stdio', link: '/guide/stdio' },
            { text: 'npm + HTTP/OAuth', link: '/guide/http-oauth' },
            { text: 'npm + HTTP/PAT', link: '/guide/http-pat' },
            { text: 'Docker + HTTP', link: '/guide/docker' },
            { text: 'Git checkout', link: '/guide/git-checkout' },
            { text: 'Claude Desktop', link: '/guide/claude-desktop' },
            { text: 'Nightly builds', link: '/guide/nightly' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Available tools', link: '/reference/tools' },
            { text: 'Tool filtering', link: '/reference/filtering' },
            { text: 'Autocomplete prompts', link: '/reference/autocomplete' },
            { text: 'Environment variables', link: '/reference/env-vars' },
          ],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Development setup', link: '/contributing/' },
            { text: 'Adding a new tool', link: '/contributing/new-tool' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/daften/fireflyiii-mcp' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/daften/fireflyiii-mcp/edit/main/docs/:path',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Dieter Blomme',
    },
  },
})
