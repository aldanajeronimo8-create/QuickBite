import { useEffect } from 'react';
import { requireSupabaseClient } from '../../../lib/supabase';

const BUTTON_CLASS = 'qb-favorite-toggle';

function heartSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
}

export function StudentMenuFavoritesBridge() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let cleanup: (() => void) | null = null;

    const run = async () => {
      const client = requireSupabaseClient();
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId || disposed) return;

      const { data: favoriteRows, error: favoriteError } = await client.from('favorites').select('product_id').eq('user_id', userId);
      if (favoriteError) throw favoriteError;
      const favorites = new Set((favoriteRows ?? []).map((row) => row.product_id));
      const { data: productRows, error: productError } = await client.from('products').select('id,name');
      if (productError) throw productError;
      const productByName = new Map((productRows ?? []).map((row) => [row.name, row.id]));

      const sync = () => {
        document.querySelectorAll<HTMLElement>('main article').forEach((article) => {
          if (article.querySelector(`.${BUTTON_CLASS}`)) return;
          const name = article.querySelector('p.min-h-10')?.textContent?.trim();
          const productId = name ? productByName.get(name) : undefined;
          if (!productId) return;
          const imageWrap = article.querySelector('.relative');
          if (!imageWrap) return;
          imageWrap.classList.add('relative');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `${BUTTON_CLASS} absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/90 text-rose-600 shadow-lg transition hover:scale-105 disabled:opacity-60`;
          button.setAttribute('aria-label', favorites.has(productId) ? `Quitar ${name} de favoritos` : `Añadir ${name} a favoritos`);
          button.innerHTML = heartSvg();
          button.style.color = favorites.has(productId) ? 'rgb(225 29 72)' : 'rgb(100 116 139)';
          if (favorites.has(productId)) button.style.opacity = '1';
          button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            button.disabled = true;
            try {
              if (favorites.has(productId)) {
                const { error } = await client.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
                if (error) throw error;
                favorites.delete(productId);
                button.style.color = 'rgb(100 116 139)';
                button.setAttribute('aria-label', `Añadir ${name} a favoritos`);
              } else {
                const { error } = await client.from('favorites').upsert({ user_id: userId, product_id: productId }, { onConflict: 'user_id,product_id' });
                if (error) throw error;
                favorites.add(productId);
                button.style.color = 'rgb(225 29 72)';
                button.setAttribute('aria-label', `Quitar ${name} de favoritos`);
              }
            } finally {
              button.disabled = false;
            }
          });
          imageWrap.appendChild(button);
        });
      };

      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.body, { childList: true, subtree: true });
      cleanup = () => observer?.disconnect();
    };

    void run().catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
      document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((node) => node.remove());
    };
  }, []);

  return null;
}
