# Revisão de correções e polish

Este relatório descreve a rodada inicial. Os ajustes posteriores de sprites, afundamento, tamanho/decoração das ilhas, áreas e comandos interativos estão em [ADJUSTMENTS.md](ADJUSTMENTS.md).

## Implementação

- `src/game/input/InputManager.ts` e `src/screens/Game/GameScreen.tsx`: ponteiros independentes compartilhando W/A/D/Space/Q/E/R com teclado; capture, release, cancel e perda de capture. Pause/focus loss limpam todos os inputs. Ações de pause e ajuda disponíveis por botão. Landscape recomendado; portrait continua funcional com orientação e safe areas.
- `src/api/lastCompleted.ts`, `pending.ts` e `src/App.tsx`: resultado concluído persistido separadamente da fila, incluindo seed, registro completo, status e erro. Pending/Failed/Saved reconstruídos após refresh; Saving interrompido volta a Pending para permitir Retry. Retry mantêm o ID original. Uma partida em andamento não escreve resultado concluído.
- `src/game/world/SpawnSystem.ts`: um novo spawn por intervalo de Enemy Spawn Time, sem população inicial. Percurso determinístico dos slots e RNG dedicado por slot; uma unidade de cada tipo por área, oito áreas, capacidade total 16. Valida terra, casco, player, distância segura e ocupação. Se um slot não puder ser preenchido, tenta os demais e adia posições inválidas. Morte libera o slot; não cria timer paralelo de respawn.
- `src/game/FixedStep.ts` e `Game.ts`: accumulator de passos de 1/60s, máximo 12 por frame, mantendo backlog. Relógio monotônico reiniciado no resume evita contabilizar tempo de aba oculta como gameplay. Render/HUD independentes dos passos da simulação.
- `GameScreen.tsx`: falha de assets expõe erro, Retry e Main Menu. Tentativas destroem recursos/listeners, zeram HUD e restauram loading. Dialogs usam focus trap, background inert, foco no conteúdo novo e restauração do opener após fechar. Escape permanece no fluxo de pause.
- `src/game/movement/ShipMovement.ts`: giro gradual com velocidade específica por tipo; avanão calculado a partir do heading atual do casco. Avoidance, chase, approach e return continuam validados por colisão.
- `SessionSettings.ts`, `MatchSeed.ts`, `api/storage.ts`, `api/pending.ts` e `main.tsx`: storage/JSON protegidos, defaults/memória quando indisponível. Import do mock HTTP também é protegido para que a dependência não bloqueie startup quando storage falhar. Falhas de escrita da fila continuam explícitas para Retry seguro.
- `GameConfig.ts`, `CombatConfig.ts`, renderers: escala 0.5 para 0.6, colliders compartilhados escalados, origens de tiros/barras revisadas. Casco e vela substituem visual intacto sob dano, preservando símbolos dos tipos. Canhões acompanham casco; tripulação temporária acompanha a explosão sem entidades/colliders.
- `IslandShapes.ts`, `WorldRenderer.ts`: 30–42 ilhas, baía côncava e península, contorno compartilhado com collider; detalhes determinísticos e água rasa somente visual. Mantidos espaçamento de 140, região segura inicial e corredores entre massas terrestres.
- HUD: painéis de score/tempo, estrela, relógio, pause e controles com assets reais; ajuda ilustrada. `U` continua mostrando os colliders/ranges reais, sem água rasa ou decoração.

## Assets inspecionados e utilizados

Referência: `assets/sample.png`. Controles de `assets/png/default/ui/controls`: `button_round_normal`, `button_round_pressed`, `icon_forward`, `icon_turn_left/right`, `icon_fire_front/left/right`, `icon_plus`, `icon_pause`. HUD: `counter_panel`, `icon_score`, `icon_time`.

Peças retina de `ship_parts`: `hull_large_2/3`; velas `sail_large_20/14` (Player), `22/16` (Chaser), `24/18` (Shooter); `cannon`; `flag_1/3/5` para preservar a identidade sob dano grave; `crew_1/2/3`. Mantidos navios `ship_1/3/5`, cannon_ball e efeitos de fogo/explosão existentes. Tiles retina: `tile_87` (vegetação pequena, sem aparência de barreira), `tile_27` (água rasa sob máscara costeira), além de `18/39/73` já usados para areia/grama/oceano. Assets default e retina foram visualmente conferidos antes do polish; as velas foram conferidas individualmente para manter símbolos corretos.

## Validação

A suíte Playwright inclui testes de lógica/unitários, integração e browser. Cobertura adicionada em `tests/polish.spec.ts`: backlog de frames lentos, direção física do casco, falha real de asset seguida de Retry, trap/restauração de foco, inputs simultâneos/cancel/blur, storage bloqueado/corrompido, resultados Pending/Failed/Saved independentes da fila e multitouch real via eventos do Chromium em layout mobile.

Também foram revisadas capturas em 1280×720, 800×600, 844×390 e 390×844, incluindo navios danificados próximos às ilhas. A documentação recomenda landscape. Validação mobile usa emulação Chromium; não foi executada em hardware fàsico.

Comandos: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` e `npm run test:production`. `TEST_PORT` permite isolar a execução de uma instância Vite com cache de hot reload, sem encerrar processos do usuário.

Resultado final: typecheck, lint e build passaram; 74 testes da suíte principal e 1 teste do build publicado passaram. Nenhum requisito de implementação ficou pendente. Mobile foi validado por emulação, sem hardware físico.

Os helpers de testes usam o módulo realmente carregado pelo navegador, incluindo a versão de hot reload, para evitar duas instâncias de Game ou da fila de registros durante a validação.
