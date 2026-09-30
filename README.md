# TranscriptForge

Chrome Manifest V3 extension for YouTube transcripts and local extractive summaries.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this directory (the one containing `manifest.json`).
3. Open the extension, paste a YouTube URL or video ID, and click **Fetch**. The active YouTube tab is filled in automatically.
4. Language codes are tried in order, for example `hi, en`. Within each language, manual captions are preferred over automatic captions.
5. After fetching, click **ChatGPT**, **Claude**, or **Gemini** to open a new browser tab with your prompt. Short transcripts are pre-filled directly into ChatGPT and Claude, while longer transcripts and Gemini automatically copy the formatted prompt to your clipboard ready for quick pasting (`Ctrl+V` / `Cmd+V`).

The checked-in `dist/background.js` is bundled and ready to load. After changing source files, run `npm ci`, `npm test`, and `npm run build`, then reload the extension in Chrome.

## Request flow and parity

Adapted from [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api/blob/master/youtube_transcript_api/_transcripts.py), inspected September 27, 2026:

- Fetch watch HTML and decode entities; retry once with the upstream CONSENT cookie if the consent form is present.
- Extract the current INNERTUBE_API_KEY from that HTML.
- POST the video ID with upstream's ANDROID / 20.10.38 client context to the player endpoint.
- Check playability, select captions by language and type, remove `fmt=srv3`, then fetch and parse XML into text/start/duration snippets.
- Support manual/generated selection, formatting preservation, and YouTube translation in the JavaScript API (`YouTubeTranscriptApi.fetch`).
- Report missing captions, bot/IP blocks, age restrictions, and required proof-of-origin tokens instead of silently trying unrelated services.

This ports the transcript retrieval path, not Python's CLI, proxies, exporters, or every public class. Browser cookies replace Python's requests session. XML and HTML entity parsing use bundled fast-xml-parser and he. Requests have a 20-second timeout each. The popup's summary ranks and selects source excerpts locally; it is not a generative AI summary and is not part of the Python package.

## Why CORS is different here

All YouTube requests execute in the extension service worker with YouTube host permissions, following [Chrome's cross-origin request model](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). The popup sends a video ID/URL through runtime messaging. The worker only accepts extension-page requests and validates YouTube hosts; it is not an arbitrary URL proxy. No content script, public CORS proxy, or forged Origin/User-Agent header is used.

The `declarativeNetRequestWithHostAccess` permission installs a session rule before fetching. It removes the browser-added Origin header only from this extension's POST requests to `https://www.youtube.com/youtubei/v1/player`, matching Python's header behavior. A live comparison for video `Am1buo9b38Y` succeeded without that header and returned HTTP 403 with an extension Origin. The rule does not change ordinary YouTube page requests or response CORS headers. Reload the extension after this manifest change.

Load the extension through Chrome. Opening `popup.html` or the older standalone `index.html` as a website does not grant extension permissions. `index.html` is the original web prototype and is not used by this extension.

Host permissions remove the ordinary website CORS barrier; they do not remove YouTube server restrictions. Videos may have no captions or require authentication or a proof-of-origin token. This port does not bypass those restrictions. YouTube's private endpoints can change.

The cookies permission supports the upstream consent-cookie retry; this may update YouTube's CONSENT cookie. The latest successful result is kept in extension session storage and cleared when the browser session ends. Transcript text is not sent to an AI provider or third-party transcript service. If the popup closes during a request, reopen after it completes to retrieve the saved result.

## Verification

`npm test` exercises mocked watch/player/caption requests, language priority, XML/entity decoding, translation, consent retry, errors, and summary selection. Live success depends on YouTube and should be verified by loading the unpacked extension and fetching a video with available captions. Fixture tests do not prove live YouTube availability.
