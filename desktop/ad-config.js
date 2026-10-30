// Configuration for Ad Network and Sponsored Banners in TranscriptForge Desktop
// You can customize the ad providers, banner content, or insert ad network scripts (Adsterra, Monetag, etc.)

export const adConfig = {
  // Mode: 'sponsor' (built-in rotating affiliate/sponsor cards) or 'network' (custom ad tags/iframes)
  mode: 'sponsor',

  // Enable/disable interstitial/popup ad after transcript fetches
  interstitialEnabled: true,
  // Show interstitial every N transcript fetches
  interstitialFrequency: 2,

  // Built-in sponsored/affiliate cards (used in 'sponsor' mode or as fallback)
  sponsorBanners: [
    {
      id: 'chatgpt-plus',
      title: 'Upgrade your AI Workflow with ChatGPT Plus',
      description: 'Get GPT-4o, advanced data analysis, and unlimited speed for summarizing complex documents.',
      badge: 'Recommended AI',
      buttonText: 'Explore ChatGPT ↗',
      url: 'https://chatgpt.com/',
      theme: 'emerald'
    },
    {
      id: 'anthropic-claude',
      title: 'Try Claude 3.5 Sonnet for Long Transcripts',
      description: '200k context window makes reading 3-hour video transcripts effortless and crystal clear.',
      badge: 'Top Pick',
      buttonText: 'Try Claude Free ↗',
      url: 'https://claude.ai/',
      theme: 'amber'
    },
    {
      id: 'nordvpn-deal',
      title: 'Protect Your Browsing & Access Global YouTube Content',
      description: 'Unlock region-restricted videos and subtitles anywhere in the world with fast, secure encryption.',
      badge: 'Special Offer',
      buttonText: 'Claim 70% Off ↗',
      url: 'https://nordvpn.com/',
      theme: 'blue'
    },
    {
      id: 'notion-ai',
      title: 'Save Transcripts Directly to Notion AI Workspace',
      description: 'Organize your video research notes, create action items, and auto-generate meeting minutes.',
      badge: 'Productivity',
      buttonText: 'Try Notion Free ↗',
      url: 'https://www.notion.so/',
      theme: 'purple'
    }
  ],

  // In 'network' mode, put your raw HTML/JS ad snippet from Adsterra, Monetag, or EthicalAds here:
  networkSnippetHtml: `
    <!-- Paste your Adsterra / Monetag / EthicalAds Banner script or iframe here -->
    <div style="font-size:12px;color:#888;text-align:center;padding:12px;">
      [Ad Network Slot: Paste your 728x90 banner code here]
    </div>
  `
};
