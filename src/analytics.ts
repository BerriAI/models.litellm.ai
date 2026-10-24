import mixpanel from 'mixpanel-browser';

// Get Mixpanel token from environment variable
const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN;

// Initialize Mixpanel
export function initAnalytics() {
  if (MIXPANEL_TOKEN) {
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: import.meta.env.DEV,
      track_pageview: true,
      persistence: 'localStorage'
    });
    console.log('Mixpanel initialized');
  } else {
    console.warn('Mixpanel token not found. Set VITE_MIXPANEL_TOKEN in your .env file');
  }
}

// Track page view
export function trackPageView(page: string) {
  if (MIXPANEL_TOKEN) {
    mixpanel.track('Page View', {
      page: page,
      url: window.location.href,
      referrer: document.referrer
    });
  }
}

// Track search
export function trackSearch(query: string, provider?: string, resultsCount?: number, filters?: { minInputTokens: number | null; minOutputTokens: number | null; freeOnly?: boolean; hiddenCount?: number; output?: string; inputs?: string[]; toolsOnly?: boolean }) {
  if (MIXPANEL_TOKEN) {
    mixpanel.track('Search', {
      query: query,
      provider: provider || 'all',
      results_count: resultsCount || 0,
      ...(filters ? {
        min_input_tokens: filters.minInputTokens,
        min_output_tokens: filters.minOutputTokens,
        zero_listed_price: !!filters.freeOnly,
        hidden_by_filters_count: filters.hiddenCount ?? 0,
        output_modality: filters.output || "all",
        input_modalities: filters.inputs ?? [],
        tools_only: !!filters.toolsOnly,
      } : {}),
      timestamp: new Date().toISOString()
    });
  }
}

// Track model/provider/endpoint request
export function trackRequest(
  type: 'provider' | 'endpoint' | 'model', 
  request: string, 
  email: string, 
  docsLink?: string,
  deadline?: string,
  willingToCall?: boolean
) {
  if (MIXPANEL_TOKEN) {
    mixpanel.track('Request Submitted', {
      request_type: type,
      request_description: request,
      has_docs_link: !!docsLink,
      has_deadline: !!deadline,
      willing_to_call: willingToCall || false,
      email_domain: email.split('@')[1] || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
}

// Track request form opened
export function trackRequestFormOpened() {
  if (MIXPANEL_TOKEN) {
    mixpanel.track('Request Form Opened', {
      timestamp: new Date().toISOString()
    });
  }
}

// Track tab change
export function trackTabChange(tab: 'models' | 'providers') {
  if (MIXPANEL_TOKEN) {
    mixpanel.track('Tab Changed', {
      tab: tab,
      timestamp: new Date().toISOString()
    });
  }
}


// Track Quick Start box copies (same event names as the docs site)
export function trackQuickStartCopy(kind: 'gateway' | 'sdk', what: 'command' | 'prompt', os?: 'mac' | 'windows') {
  if (MIXPANEL_TOKEN) {
    mixpanel.track(what === 'command' ? 'Quick Start Command Copied' : 'Agent Prompt Copied', {
      kind,
      os,
      source: 'models_catalog'
    });
  }
}
