import { useEffect } from 'react';
import { requireSupabaseClient } from '../../../lib/supabase';

const BUTTON_CLASS = 'qb-favorite-menu-button';
const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';

export function StudentMenuFavoritesOverlay() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    const initialize = async () => {
      const client = requireSupabaseClient();
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId || disposed) return;
      const [{ data: products, error: productsError }, { data: favorites, error: favoritesError }] = await Promise.all([
        client.from('products').select('id,name'),
        client.from('favorites').select('product_id').eq('user_id', userId),
      ]);
      if (productsError || favoritesError || disposed) return;
      const productByName = new Map((products ?? []).map((product) => [String(product.name).trim().toLowerCase(), product.id]));
      const favoriteIds = new Set((favorites ?? []).map((favorite) => favorite.product_id));

      const decorate = () => {
        document.querySelectorAll<HTMLElement>('main article').forEach((article) => {
          if (article.querySelector(`.${BUTTON_CLASS}`)) return;
          const nameElement = article.querySelector('p.min-h-10');
          const name = nameElement?.textContent?.trim().toLowerCase();
          const productId = name ? productByName.get(name) : undefined;
          if (!productId) return;
          const imageWrap = article.querySelector<HTMLElement>('.relative');
          if (!imageWrap) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `${BUTTON_CLASS} absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/90 text-rose-600 shadow-lg transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-60`;
          button.setAttribute('aria-label', favoriteIds.has(productId) ? `Quitar ${name} de favoritos` : `Añadir ${name} a favoritos`);
          button.innerHTML = heartSvg;
          button.style.color = favoriteIds.has(productId) ? 'rgb(225 29 72)' : 'rgb(100 116 139)';
          button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            button.disabled = true;
            try {
              const exists = favoriteIds.has(productId);
              const result = exists
                ? await client.from('favorites').delete().eq('user_id', userId).eq('product_id', productId)
                : await client.from('favorites').upsert({ user_id: userId, product_id: productId }, { onConflict: 'user_id,product_id' });
              if (result.error) return;
              if (exists) favoriteIds.delete(productId); else favoriteIds.add(productId);
              const active = favoriteIds.has(productId);
              button.style.color = active ? 'rgb(225 29 72)' : 'rgb(100 116 139)';
              button.setAttribute('aria-label', active ? `Quitar ${name} de favoritos` : `Añadir ${name} a favoritos`);
            } finally {
              button.disabled = false;
            }
          });
          imageWrap.appendChild(button);
        });
      };
      decorate();
      observer = new MutationObserver(decorate);
      observer.observe(document.body, { childList: true, subtree: true });
    };
    void initialize();
    return () => { disposed = true; observer?.disconnect(); document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((node) => node.remove()); };
  }, []);
  return null;
}
