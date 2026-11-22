import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';

import { baseOptions } from '../lib/layout.shared';
import { Provider } from './provider';
import type { ProviderProps } from './provider';

export function NotFound(props: ProviderProps) {
  return (
    <Provider {...props}>
      <HomeLayout {...baseOptions()}>
        <DefaultNotFound />
      </HomeLayout>
    </Provider>
  );
}
