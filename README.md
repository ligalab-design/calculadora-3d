# Liga Lab — Calculadora 3D

App web instalável (PWA) que calcula o custo e o preço de venda de impressões 3D.
Funciona offline depois da primeira abertura. No ar em
https://ligalab-design.github.io/calculadora-3d/

## Funções

- Cálculo de custo (filamento, energia, máquina, falhas, mão de obra) e preço de venda
- Preço final editável e arredondamento comercial
- Tabela de preço por quantidade
- Pedidos com cliente e situação (orçado, aprovado, em produção, entregue, pago), com busca e filtros
- Resumo de vendas por mês
- Importação de peso e tempo do arquivo fatiado (.gcode ou .gcode.3mf do Bambu Studio)
- Cadastro de clientes
- Orçamento para cliente (texto para copiar ou abrir no WhatsApp)
- Cadastro de filamentos com controle de estoque
- Backup: exportar e importar todos os dados
- Sincronização opcional com um arquivo no Google Drive (junta os dados de vários aparelhos)

Os dados ficam salvos no aparelho (localStorage). Com a sincronização ligada, uma cópia vai para
o arquivo `Liga Lab Calculadora 3D - dados.json` no Drive da conta conectada.

## Arquivos

- `index.html` — telas e estilo
- `app.js` — liga a tela aos cálculos e aos dados
- `calc.js` — cálculos (sem dependência de tela)
- `dados.js` — filamentos, estoque, clientes, pedidos, resumo de vendas, orçamento e backup (sem dependência de tela)
- `importar.js` e `zip.js` — leitura de arquivos fatiados (.gcode e .3mf)
- `sync.js` — o que é sincronizado e como juntar dados de dois aparelhos (sem dependência de tela)
- `nuvem.js` e `drive.js` — motor da sincronização, login do Google e arquivo no Drive
- `config.js` — ID do cliente OAuth do Google (vazio = sincronização desligada)
- `tests/` — testes automatizados de `calc.js`, `dados.js`, `importar.js` e `zip.js`
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
(por exemplo, `ligalab-calc-v6`) para os aparelhos baixarem a versão nova.
