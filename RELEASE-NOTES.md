# v0.3.0 — live privado + demo pública

Histórico técnico preservado nesta versão: o FORGE criou a variante inicial com backend de estado ao vivo; o VOLT desenvolveu a variante de maquete arquitetônica e seus rótulos/controles 3D. A v0.3.0 reúne essas linhas de trabalho em um pacote isolado. Os diretórios e o Git do workspace original não fazem parte deste pacote público.

- Nova versão isolada: maquete 3D responsiva da base VOLT, sem alterar as versões anteriores.
- Modelo LLM efetivo somente com fonte compatível; no `claude-cli`, configurado é previsto/não confirmado.
- Relações reais `main` → especialista; briefing só quando associado ao run ativo da mesma sessão. Falas saneadas quando observadas; ausência de prova aparece como indisponibilidade.
- API/SSE em loopback, Host restrito, stale/offline conservador e reconexão.
- Demo estática 100% sintética com base path de GitHub Pages.
- Testes E1–E3, contrato, API/SSE, DOM hostil, build live/demo e capturas desktop/mobile/320 px.
- Consolidação do vínculo temporal de `startAt`/`startedAt` com janela de −1 s a +2 s; `inFlightRun` com ID divergente é descartado.
- Saneamento ampliado para documentos formatados, senhas com conectivo e autorização Basic.

As cinco texturas foram substituídas por ativos procedurais gerados pelo script versionável `scripts/generate_textures.py`, sem insumos externos. A revisão de código/privacidade passou; ajustes visuais do reteste aguardam novo parecer do PIXEL antes de release público. A publicação da rota live privada e do repositório é etapa separada.
