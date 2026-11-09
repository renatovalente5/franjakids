/* Os utilitários HTTP comuns às rotas: a resposta JSON (sempre sem cache) e a leitura de um
   corpo JSON com tecto de tamanho. */

/* 64 KiB e não os 16 da LF Mobile: aqui cada linha do carrinho pode levar um texto de
   personalização (até 200 caracteres, e uma letra acentuada são 2 bytes), e um carrinho de 50
   linhas personalizadas passa dos 16 KiB. Acima de 64 KiB já não é uma encomenda. */
export const MAX_CORPO_BYTES = 64 * 1024;

export function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

/* O corpo como JSON, ou um erro já em forma de resposta ({ corpo } | { resposta }). */
export async function lerCorpoJson(request, cors = {}) {
  const tamanho = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (tamanho > MAX_CORPO_BYTES) return { resposta: json({ erro: 'Pedido demasiado grande.' }, 413, cors) };
  const bruto = await request.text();
  if (bruto.length > MAX_CORPO_BYTES) return { resposta: json({ erro: 'Pedido demasiado grande.' }, 413, cors) };
  try {
    const corpo = JSON.parse(bruto);
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { resposta: json({ erro: 'Pedido inválido.' }, 400, cors) };
    return { corpo };
  } catch {
    return { resposta: json({ erro: 'Pedido inválido.' }, 400, cors) };
  }
}
