import type { ServerBuild } from '@remix-run/cloudflare';
import { createPagesFunctionHandler } from '@remix-run/cloudflare-pages';

export const onRequest: PagesFunction = async (context) => {
  try {
    // @ts-ignore - Build artifact exists at runtime on Cloudflare Pages after `remix vite:build`.
    const serverBuild = (await import('../build/server')) as unknown as ServerBuild;

    const handler = createPagesFunctionHandler({
      build: serverBuild,
    });

    return handler(context);
  } catch (err) {
    // Graceful fallback when build output isn't present during local typecheck or dev.
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: 'Server build not found',
        hint: 'Run `pnpm run build` or use `pnpm run start` which builds automatically.',
        details: message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
