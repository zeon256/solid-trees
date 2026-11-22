import type { APIRoute, GetStaticPaths } from 'astro';

import { docsLlms } from '../lib/source';

export const prerender = true;

// `llms.txt`, `llms-full.txt`, and the Markdown form of every page.
export const getStaticPaths = (async () => {
  const files = await docsLlms.files();
  return files.map((path) => ({
    params: { path: decodeURI(path.slice(1)) },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const response = await docsLlms.serve(`/${params.path ?? ''}`);
  return response ?? new Response(null, { status: 404 });
};
