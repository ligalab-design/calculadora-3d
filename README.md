# Liga Lab — Calculadora 3D

App web instalável (PWA) que calcula o custo e o preço de venda de impressões 3D.
Funciona offline depois da primeira abertura.

## Arquivos

- `index.html` — tela do app
- `calc.js` — lógica dos cálculos (sem dependência de tela)
- `tests/calc.test.js` — testes automatizados dos cálculos
- `sw.js` — funcionamento offline
- `manifest.webmanifest` e `icons/` — nome e ícone do app
- `.github/workflows/deploy.yml` — roda os testes e publica no GitHub Pages

## Testes

Precisa do Node.js 20 ou mais recente. Não há dependências para instalar.

```
npm test
```

## Publicar no GitHub Pages

1. Envie estes arquivos para o branch `main` do repositório.
2. No repositório: **Settings → Pages → Source: GitHub Actions**.
3. A cada envio, os testes rodam; se passarem, o app é publicado em
   `https://USUARIO.github.io/REPOSITORIO/`.

## Instalar no iPhone

1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.

## Atualizar o app

Ao mudar qualquer arquivo, aumente o número em `CACHE` no `sw.js`
(por exemplo, `ligalab-calc-v2`) para o iPhone baixar a versão nova.
