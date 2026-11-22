import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

import { appName, repoUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src="/icon.svg" alt="" width={20} height={20} />
          {appName}
        </>
      ),
    },
    githubUrl: repoUrl,
    links: [
      { text: 'Playground', url: 'https://trees.inve.rs', external: true },
    ],
  };
}
