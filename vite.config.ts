import { Buffer } from 'node:buffer';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import decisionHandler from './api/decision.ts';

function localDecisionApi(): Plugin {
  return {
    name: 'local-decision-api',
    configureServer(server) {
      server.middlewares.use('/api/decision', (req, res, next) => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        req.on('error', next);

        req.on('end', async () => {
          try {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            const body = rawBody ? JSON.parse(rawBody) : undefined;

            const apiResponse = {
              status(code: number) {
                res.statusCode = code;
                return apiResponse;
              },
              json(payload: unknown) {
                if (!res.headersSent) {
                  res.setHeader('Content-Type', 'application/json');
                }
                res.end(JSON.stringify(payload));
              },
              setHeader(name: string, value: string) {
                res.setHeader(name, value);
              },
            };

            await decisionHandler({ method: req.method, body }, apiResponse);
          } catch (error) {
            next(error as Error);
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  process.env.JEV_API_KEY ??= env.JEV_API_KEY;
  process.env.JEV_MODEL ??= env.JEV_MODEL;
  process.env.JEV_MODE ??= env.JEV_MODE;

  return {
    plugins: [tailwindcss(), localDecisionApi()],
    server: {
      host: '0.0.0.0',
    },
  };
});
