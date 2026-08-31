import { useEffect } from 'react';
import { requireSupabaseClient } from '../../../lib/supabase';

const BUTTON_CLASS = 'qb-favorite-menu-button';

export function StudentMenuFavoritesOverlay() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    const initialize = async () => {
      const client = requireSupabaseClient();
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId || disposed) return;
      const [{ data: products }, { data: favorites }] = await Promise.all([
        client.from('products').select('id,name'),
        client.from('favorites').select('product_id').eq('user_id', userId),
      ]);
      if (disposed) return;
      const productByName = new Map((products ?? []).map((product) => [String(product.name).trim().toLowerCase(), product.id]));
      const favoriteIds = new Set((favorites ?? []).map((favorite) => favorite.product_id));

      const decorate = () => {
        document.querySelectorAll('main article').forEach((article) => {
          if (article.querySelector(`.${BUTTON_CLASS}`)) return;
          const nameElement = article.querySelector('p.font-black');
          const name = nameElement?.textContent?.trim().toLowerCase();
          const productId = name ? productByName.get(name) : undefined;
          if (!productId) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `${BUTTON_CLASS} absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/95 text-xl shadow-lg backdrop-blur-xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-emerald-200`;
          button.setAttribute('aria-label', favoriteIds.has(productId) ? `Quitar ${name} de favoritos` : `Agregar ${name} a favoritos`);
          button.textContent = favoriteIds.has(productId) ? '♥' : '♡';
          button.style.color = favoriteIds.has(productId) ? '#e11d48' : '#64748b';
          button.addEventListener('click', async () => {
            button.disabled = true;
            const exists = favoriteIds.has(productId);
            const result = exists
              ? await client.from('favorites').delete().eq('user_id', userId).eq('product_id', productId)
              : await client.from('favorites').insert({ user_id: userId, product_id: productId });
            button.disabled = false;
            if (result.error) return;
            if (exists) favoriteIds.delete(productId); else favoriteIds.add(productId);
            const active = favoriteIds.has(productId);
            button.textContent = active ? '♥' : '♡';
            button.style.color = active ? '#e11d48' : '#64748b';
            button.setAttribute('aria-label', active ? `Quitar ${name} de favoritos` : `Agregar ${name} a favoritos`);
          });
          article.classList.add('relative');
          article.appendChild(button);
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
