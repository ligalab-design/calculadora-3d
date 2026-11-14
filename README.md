# Liga Lab — Calculadora 3D

App web instalável (PWA) que calcula o custo e o preço de venda de impressões 3D.
Funciona offline depois da primeira abertura. No ar em
https://ligalab-design.github.io/calculadora-3d/

## Funções

- Cálculo de custo (filamento, energia, máquina, falhas, mão de obra) e preço de venda
- Preço final editável e arredondamento comercial
- Tabela de preço por quantidade
- Histórico de peças
- Orçamento para cliente (texto para copiar ou abrir no WhatsApp)
- Cadastro de filamentos com controle de estoque
- Backup: exportar e importar todos os dados

Os dados ficam salvos só no aparelho (localStorage).

## Arquivos

- `index.html` — telas e estilo
- `app.js` — liga a tela aos cálculos e aos dados
- `calc.js` — cálculos (sem dependência de tela)
- `dados.js` — filamentos, estoque, histórico, orçamento e backup (sem dependência de tela)
- `tests/` — testes automatizados de `calc.js` e `dados.js`
- `sw.js` — funcionamento offline
- `manifest.webmanifest` e `icons/` — nome e ícone do app
- `.github/workflows/deploy.yml` — roda os testes e publica no GitHub Pages

## Testes

Precisa do Node.js 20 ou mais recente. Não há dependências para instalar.

```
npm test
```

## Publicação

A cada envio para o branch `main`, os testes rodam; se passarem, o app é publicado
no GitHub Pages (Settings → Pages → Source: GitHub Actions).

## Instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.

## Atualizar o app

Ao mudar qualquer arquivo, aumente o número em `CACHE` no `sw.js`
(por exemplo, `ligalab-calc-v4`) para os aparelhos baixarem a versão nova.
