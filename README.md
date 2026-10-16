# Agent City for OpenClaw

Maquete 3D para acompanhar agentes OpenClaw. Esta versão tem **dois modos separados**:

- **Live privado:** consulta o OpenClaw instalado no mesmo computador, mostra execuções confirmadas, modelo LLM efetivo apenas quando há fonte compatível, delegações do agente `main` para especialistas, trechos saneados do briefing do run em execução e falas textuais observadas.
- **Demo pública:** dados inteiramente sintéticos, compilados no frontend. Não lê `~/.openclaw`, não abre `/api/*` e não contém tarefas, sessões ou URLs reais.

A maquete é ilustrativa. Carros, lazer e deslocamentos não são telemetria. O backend é somente leitura e não envia comandos aos agentes.

## Requisitos e instalação

Node.js 20+; modo live exige CLI `openclaw` no PATH, Gateway local acessível e permissão local de leitura de `~/.openclaw/openclaw.json`.

```sh
npm ci
npm test
npm run build
PORT=4175 npm start
```

Abra `http://127.0.0.1:4175/`. O servidor escuta **somente `127.0.0.1`**, mesmo que `HOST` seja definido. Se a porta estiver ocupada, use outra em `PORT`.

Para desenvolvimento: inicie o backend em 4175 e rode `npm run dev` em outro terminal. O Vite usa 5175 e faz proxy local da API; com outra porta de backend, use `AGENT_CITY_API_PORT` no comando de desenvolvimento.

## Demo estática / GitHub Pages

```sh
npm run build:demo
```

Publique **somente** o conteúdo de `dist-demo/` em GitHub Pages no caminho `/agent-city-for-openclaw/`. O build usa esse base path. Não publique `dist/` do modo live com backend ou capturas de operação. A demo não requer OpenClaw, login nem servidor Node. Verifique no navegador que não houve requisição a `/api/*`.

## Dados exibidos e limites

`server/index.mjs` lê `agents.entries` e o modelo primário configurado de `openclaw.json`; consulta `sessions.list` a cada 8 s. Só `hasActiveRun: true` comprova trabalho. Para runtime Codex, `activeModel`/`activeModelProvider` do Gateway são a fonte preferida do **modelo efetivo**; na ausência, uma mensagem de assistente associada à execução e posterior a `startAt`/`startedAt` fornece evidência mais fraca, identificada pela fonte. Sem início do run, nem mensagens nem `activeModel` direto servem de prova. No runtime `claude-cli`, o modelo configurado aparece como **previsto, não confirmado**, nunca como efetivo, mesmo se houver `activeModel`. `model` da sessão ou o primário configurado não são apresentados como efetivos.

Para sessões filhas do `main`, o coletor consulta `chat.history` (até 1.000 mensagens da janela recente). O vínculo `parentSessionKey` comprova a delegação. Briefing só é atribuído à execução ativa **da mesma sessão**, se o marcador `[Subagent Task]` tiver horário entre 1 s antes e 2 s depois de `startAt`/`startedAt`; outra mensagem do usuário ou fala de assistente antes do início invalida o vínculo. Fora dessa janela aparece indisponível, sem reciclar instrução de run encerrado. O Max aparece como ativo com `Delegando → N` enquanto há N delegações em execução. Fala em andamento usa `inFlightRun.text`, quando a fonte o fornece, após saneamento. No `claude-cli`, não se reaproveitam falas do histórico. No Codex, mensagens `assistant` de texto posteriores ao início da execução podem ser exibidas; se houver IDs de run ativos, precisam coincidir. Resultados de ferramenta e conteúdo de terceiros não são republicados. Não há conversa simulada no live. Sem histórico ou início confiável, briefing/fala ficam indisponíveis. Delegações encerradas não são exibidas como trabalho atual; o estado `done` não comprova entrega.

**Limite da fonte:** `activeRunIds` pode vir vazio mesmo com execução ativa; nesse caso, o vínculo de briefing depende da mesma sessão e da janela de `startAt`/`startedAt`, e a fonte de modelo/fala por mensagem é temporal (evidência mais fraca que um ID de run). Um briefing anterior sem resposta, dentro de 1 s do novo início e sem mensagem intermediária, permanece indistinguível sem ID de run. Reteste independente observou delegações ativas com briefing correspondente e outra sem briefing atribuível, exibida como indisponível; histórico encerrado não foi reaproveitado. O Gateway também pode deixar de fornecer `inFlightRun.text`; então o painel não inventa fala. Se `inFlightRun.startedAt` existir e for anterior ao início compatível do run, ou se o ID fornecido divergir dos IDs ativos disponíveis, o trecho é ignorado.

O contrato da API é fechado: `connected`, `updatedAt`, `mode`, `agents[]` (`id`, `name`, `emoji`, `state`, `task`, `model.configured`, `model.effective`, `model.source`, `model.availability`) e `delegations[]` (`from`, `to`, `task`, `startedAt`, `status`, `messages[]` com `speaker`, `text`, `at`). Chaves de sessão, IDs de run, caminhos, configuração bruta e payloads de ferramentas não atravessam. Textos passam por redação server-side de credenciais, URLs, domínios, caminhos, contatos e identificadores longos; o DOM usa `textContent`. Um filtro automático não reconhece todos os nomes ou segredos possíveis: **o modo live é para acesso privado autenticado, nunca Internet pública**.

Falha de consulta limpa os estados ativos, modelos efetivos e delegações atuais. Silêncio por mais de 30 s faz o mesmo. O navegador reconecta SSE e consulta `/api/state` como reserva; timestamp recente sozinho nunca indica trabalho.

## Acesso privado e rollback

Mantenha o backend no loopback. Um operador pode conectar uma rota **privada autenticada** existente à porta local, com Host permitido por `ALLOWED_HOSTS=nome-do-host` (nome apenas, sem esquema/porta). Essa opção restringe Host, **não é autenticação**. Não use Funnel, proxy público ou encaminhamento de porta da Internet para o live.

Esta versão não altera Gateway, LaunchAgents, plugins, `openclaw.json` nem as instalações anteriores. Para rollback, retire somente a rota desta porta e encerre o processo desta versão; as demais instalações seguem independentes. Antes de trocar rota, registre destino anterior e valide estado/API/HTTPS/rotas vizinhas. Reinício após reboot não é fornecido por este repositório.

## Testes e auditoria

```sh
npm test
python3 tests/adversarial_dom.py
npm run build
npm run build:demo
npm audit --omit=dev --audit-level=high
```

O teste DOM requer Python Playwright e Chrome instalados; inicia apenas um servidor sintético em 127.0.0.1:4178. `tests/visual.py` gera capturas desktop/mobile/estreitas do live local e da demo e mede overflow, integridade do nome curto do modelo, erros de página, respostas HTTP e chamadas à API. Capturas reais ficam em `evidence/`, ignorado pelo Git.

Antes de publicar o repositório, revise `git status`, arquivos ignorados, licença dos ativos e qualquer fixture nova. Não versione `.env`, logs, transcrições, screenshots live, segredos ou URLs privadas. Dependências: Three.js (MIT) e Vite (MIT).

As cinco texturas em `public/tex/` são **geradas neste repositório**, sem imagens de entrada ou serviços externos, por `scripts/generate_textures.py` (Pillow 12.1.1 no teste de 16/10/2026). Para reproduzir: `python3 -m pip install Pillow` e `python3 scripts/generate_textures.py`. Os binários anteriores, copiados do protótipo PIXEL, foram substituídos; não são candidatos ao commit. O código do gerador e seus resultados integram a licença MIT deste repositório.
