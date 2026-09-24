# Deployment

This project is designed to deploy as a static Vite frontend plus a serverless API endpoint.

The recommended platform is Vercel because the repository already uses a Vercel-style `api/decision.ts` route.

---

## Environment variables

Required for real Jev decisions:

```env
JEV_API_KEY=your_real_key
JEV_MODEL=jev-latest
```

Optional:

```env
JEV_MODE=mock
```

`JEV_MODE=mock` forces the server endpoint to return mock decisions.

---

## Important security rule

Do not create this variable:

```env
VITE_JEV_API_KEY=...
```

Anything prefixed with `VITE_` is exposed to browser JavaScript. The Jev key must remain server-side.

Correct flow:

```txt
Browser
  -> /api/decision
  -> server reads JEV_API_KEY
  -> server calls Jev
  -> server returns typed decision
```

---

## Vercel deployment

1. Push the repository to GitHub.
2. Import the repo in Vercel.
3. Add environment variables in the Vercel project settings:

```env
JEV_API_KEY=your_real_key
JEV_MODEL=jev-latest
```

4. Deploy.

Vercel will:

- build the Vite app;
- serve the static frontend;
- run `api/decision.ts` as a serverless function.

---

## Local production check

```bash
npm run build
npm run preview
```

Note: `npm run preview` only previews the static frontend. For local API behavior, use:

```bash
npm run dev
```

or:

```bash
npm run dev:vercel
```

---

## Mock mode

If you want a demo without API calls:

```bash
npm run dev:mock
```

or set:

```env
JEV_MODE=mock
```

The UI will still show the decision source so reviewers can tell whether decisions came from:

- `jev`
- `mock`
- `fallback`

---

## Troubleshooting

### The panel shows `fallback`

Possible causes:

- `JEV_API_KEY` is missing;
- the key is invalid;
- the local API route is not running;
- Jev API returned an error;
- response validation failed.

Check the terminal logs for `/api/decision` errors.

### The browser console shows 404 for `/api/decision`

Use:

```bash
npm run dev
```

The custom Vite middleware provides the local route.

### Vercel deployment works but decisions fail

Check that `JEV_API_KEY` is configured in Vercel environment variables, not only in local `.env`.

### Language switch does not persist

The language preference is stored in `localStorage`. Clear site data if you need to reset it.
