# Item localization

The Object Builder owns the English item text and the Portuguese, Spanish, and
Polish translations. Compiling writes one `item-catalog.<locale>.json` per
language into the shared asset package.

## Local automatic translation

1. Enable Cloud Translation API in a Google Cloud project and create an API key.
2. Run `npm run translation:setup`.
3. Add the Google API key to `.dev.vars`.
4. Run `npm run dev`. It starts both Vite and the local translation Worker.

The setup command generates the access token and shares it with the local
frontend through ignored environment files. It is not necessary to paste the
token into the Localization tab.

The Google API key never enters the browser. The Worker accepts at most 40 items
per request, restricts browser origins, and creates `draft` translations that
must be reviewed.

The Localization tab shows English, Portuguese, Spanish, and Polish together.
`Re-review all translations` changes existing `reviewed` entries back to
`draft` without modifying their text. `Next to review` walks through every item
that is missing, stale, or not reviewed. Runtime consumers use the catalog text
regardless of review status; the status exists only for the editorial workflow.

## Production

1. Set the production Object Builder origin in `ALLOWED_ORIGINS` inside
   `wrangler.jsonc`.
2. Run `npx wrangler secret put GOOGLE_TRANSLATE_API_KEY`.
3. Run `npx wrangler secret put TRANSLATION_ACCESS_TOKEN`.
4. Run `npm run worker:deploy`.
5. Build the Object Builder with `VITE_TRANSLATION_API_URL` set to the deployed
   Worker URL plus `/translate-items`.

The compilation step never calls Google. It only publishes translations already
stored in the catalogs, so asset builds stay deterministic.
