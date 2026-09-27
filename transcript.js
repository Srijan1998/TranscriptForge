// Request flow adapted from youtube-transcript-api; see THIRD_PARTY_NOTICES.md.
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import he from 'he';

export class TranscriptError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new TranscriptError(code, message); };

export function extractVideoId(input) {
  if (typeof input !== 'string') return null;
  input = input.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}

export function assertPlayability(status = {}) {
  if (!status.status || status.status === 'OK') return;
  const reason = status.reason || 'YouTube cannot play this video.';
  if (status.status === 'LOGIN_REQUIRED' && /bot/i.test(reason)) fail('REQUEST_BLOCKED', 'YouTube blocked this request with a bot check. Try again later.');
  if (status.status === 'LOGIN_REQUIRED' && /age/i.test(reason)) fail('AGE_RESTRICTED', 'This video is age restricted.');
  if (status.status === 'ERROR' && reason === 'Video unavailable') fail('VIDEO_UNAVAILABLE', reason);
  fail('VIDEO_UNPLAYABLE', reason);
}

export function selectTrack(tracks, languages = ['en'], kind = 'any') {
  for (const language of languages) {
    for (const generated of [false, true]) {
      if (kind === 'manual' && generated || kind === 'generated' && !generated) continue;
      const track = tracks.find(t => t.languageCode === language && (t.kind === 'asr') === generated);
      if (track) return track;
    }
  }
  fail('NO_TRANSCRIPT_FOUND', `No matching transcript. Available languages: ${[...new Set(tracks.map(t => t.languageCode))].join(', ')}.`);
}

export function parseTranscript(xml, preserveFormatting = false) {
  if (!xml.trim()) fail('EMPTY_TRANSCRIPT', 'YouTube returned empty captions. It may require a proof-of-origin token.');
  if (XMLValidator.validate(xml) !== true) fail('INVALID_TRANSCRIPT', 'YouTube returned invalid caption XML.');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false,
    trimValues: false, isArray: name => name === 'text', processEntities: true });
  const doc = parser.parse(xml);
  if (!doc.transcript) fail('INVALID_TRANSCRIPT', 'The response is not a transcript.');
  return (doc.transcript.text || []).flatMap(node => {
    const raw = typeof node === 'string' ? node : node['#text'];
    if (raw === undefined || raw === '') return [];
    const start = Number(node.start), duration = Number(node.dur ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(duration)) fail('INVALID_TRANSCRIPT', 'Invalid caption timing.');
    const decoded = he.decode(String(raw));
    const text = decoded.replace(/<[^>]*>/g, tag => preserveFormatting && /^<\/?(?:strong|em|b|i|mark|small|del|ins|sub|sup)\b/i.test(tag) ? tag : '');
    return [{ text, start, duration }];
  });
}

export class YouTubeTranscriptApi {
  constructor({ fetchImpl = fetch, checkPermission = async () => true, setConsent = async () => fail('CONSENT_REQUIRED', 'Open YouTube and complete its consent screen first.') } = {}) {
    // Native worker fetch requires the global receiver, not this API instance.
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.checkPermission = checkPermission;
    this.setConsent = setConsent;
  }
  async request(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !(parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com'))) fail('INVALID_URL', 'Unexpected caption host.');
    const stage = parsed.pathname === '/watch' ? 'watch page' : parsed.pathname === '/youtubei/v1/player' ? 'player API' : 'caption download';
    if (!await this.checkPermission(parsed.origin)) fail('SITE_PERMISSION_REQUIRED', `Chrome has not granted access to ${parsed.hostname}. In chrome://extensions, open TranscriptForge → Details → Site access and allow YouTube, then reload the extension.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.fetchImpl(url, { credentials: 'include', ...options,
        headers: { 'Accept-Language': 'en-US', ...options.headers }, signal: controller.signal });
      if (response.status === 429) fail('IP_BLOCKED', 'YouTube is rate limiting this connection. Try again later.');
      if (!response.ok) {
        const diagnostic = { stage, endpoint: parsed.origin + parsed.pathname, status: response.status };
        console.warn('[TranscriptForge] HTTP request rejected', diagnostic);
        const failure = new TranscriptError('HTTP_ERROR', `YouTube ${stage} returned HTTP ${response.status}.`);
        failure.diagnostic = diagnostic;
        throw failure;
      }
      return await response.text();
    } catch (error) {
      if (error instanceof TranscriptError) throw error;
      // Omit query strings: caption URLs can contain signatures and visitor data.
      const diagnostic = { stage, endpoint: parsed.origin + parsed.pathname, errorName: error.name, browserMessage: error.message };
      console.warn('[TranscriptForge] Request failed', diagnostic);
      const failure = new TranscriptError(error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        error.name === 'AbortError' ? `YouTube ${stage} timed out.` : `YouTube ${stage} failed (${error.message || error.name}). Site permission is granted. Open the extension service-worker console for the browser's network error.`);
      failure.diagnostic = diagnostic;
      throw failure;
    } finally { clearTimeout(timeout); }
  }
  async list(input) {
    const videoId = extractVideoId(input);
    if (!videoId) fail('INVALID_VIDEO_ID', 'Enter a valid YouTube URL or 11-character video ID.');
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    let html = he.decode(await this.request(watch));
    if (html.includes('action="https://consent.youtube.com/s"')) {
      const value = /name="v" value="(.*?)"/.exec(html)?.[1];
      if (!value) fail('CONSENT_REQUIRED', 'Open YouTube and complete its consent screen.');
      await this.setConsent('YES+' + value);
      html = he.decode(await this.request(watch));
      if (html.includes('action="https://consent.youtube.com/s"')) fail('CONSENT_REQUIRED', 'Open YouTube and complete its consent screen.');
    }
    const apiKey = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/.exec(html)?.[1];
    if (!apiKey) fail(html.includes('class="g-recaptcha"') ? 'IP_BLOCKED' : 'YOUTUBE_DATA_UNPARSABLE', 'YouTube returned a challenge or an unrecognized watch page.');
    let player;
    try {
      player = JSON.parse(await this.request(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId })
      }));
    } catch (error) {
      if (error instanceof TranscriptError) throw error;
      fail('YOUTUBE_DATA_UNPARSABLE', 'YouTube returned invalid player data.');
    }
    assertPlayability(player.playabilityStatus);
    const captions = player.captions?.playerCaptionsTracklistRenderer;
    if (!captions?.captionTracks?.length) fail('TRANSCRIPTS_DISABLED', 'This video has no available captions.');
    return { videoId, title: player.videoDetails?.title || '', tracks: captions.captionTracks,
      translationLanguages: captions.translationLanguages || [] };
  }
  async fetch(input, { languages = ['en'], kind = 'any', translateTo, preserveFormatting = false } = {}) {
    if (!Array.isArray(languages) || !languages.length || languages.some(l => typeof l !== 'string') || !['any', 'manual', 'generated'].includes(kind)) fail('INVALID_OPTIONS', 'Invalid language or caption type.');
    const list = await this.list(input);
    const track = selectTrack(list.tracks, languages, kind);
    const url = new URL(track.baseUrl.replace('&fmt=srv3', ''));
    if (url.searchParams.get('exp') === 'xpe') fail('PO_TOKEN_REQUIRED', 'YouTube requires a proof-of-origin token for this transcript.');
    let language = track.name?.runs?.map(r => r.text).join('') || track.name?.simpleText || track.languageCode;
    if (translateTo) {
      if (!track.isTranslatable) fail('NOT_TRANSLATABLE', 'This transcript cannot be translated.');
      const target = list.translationLanguages.find(l => l.languageCode === translateTo);
      if (!target) fail('TRANSLATION_LANGUAGE_NOT_AVAILABLE', 'Requested translation language is unavailable.');
      url.searchParams.set('tlang', translateTo);
      language = target.languageName?.runs?.map(r => r.text).join('') || target.languageName?.simpleText || translateTo;
    }
    const snippets = parseTranscript(await this.request(url.href), preserveFormatting);
    if (!snippets.length) fail('EMPTY_TRANSCRIPT', 'YouTube returned no caption text.');
    return { videoId: list.videoId, title: list.title, language, languageCode: translateTo || track.languageCode,
      isGenerated: Boolean(translateTo) || track.kind === 'asr', snippets };
  }
}
