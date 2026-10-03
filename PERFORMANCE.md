# Pirate Battle — avaliação de performance

Atualizado em 2026-10-03. Esta etapa alterou somente instrumentação opt-in, scripts e documentação. Nenhuma otimização, regra, qualidade visual ou dependência foi alterada. [Propostas para aprovação](PERFORMANCE_PROPOSALS.md). A evidência histórica foi preservada abaixo.

## Resultado e ambiente

A partida principal completou **180s de simulação ativa**, terminando por `timeExpired`, com HP final 32,33 e pontuação 3. A coleta começou em 0,0667s e cobriu **179,9213s** de intervalos: os primeiros aproximadamente 67ms não foram instrumentados. Nenhuma pausa ou erro JavaScript foi registrado. Resultado: **59,69 callbacks e chamadas ao renderer por segundo, p95 16,8ms**. Está próximo do alvo, mas **60,00 FPS sustentados e apresentação física a 60 FPS não foram comprovados**.

Build otimizado `tsc -b && vite build --sourcemap`, servido por Vite preview, sem dev server/HMR. A partida principal não coletou CPU samples, trace, heap ou screenshots durante o combate. A captura ocorreu depois. As execuções de navegador foram sequenciais, fora do sandbox, sem testes simultâneos.

Windows 10.0.26200; Intel Core i3-12100F; RAM física 17.010.458.624 bytes; NVIDIA GeForce RTX 3060, driver 32.0.15.9579; Chromium 153.0.8010.12 com janela. PixiJS **WEBGL**, ANGLE/NVIDIA/D3D11; composição GPU, rasterização e WebGL habilitados em `SystemInfo.getInfo`. [Consulta de hardware](docs/performance/reference-hardware.json). CIM inicialmente falhou no sandbox; uma consulta somente leitura fora dele confirmou o hardware.

Windows: tela 1366 × 768, modo 59Hz. Chromium `screen`, viewport e canvas real: 1280 × 720; DPR 1. Playwright configura viewport/DPR e a API de tela pode diferir do monitor físico. Energia: Equilibrado. CDP CPU/network throttling não foi solicitado. A linha de comando completa/defaults do Playwright não foi salva nas coletas entregues; o runner final passa a registrá-la para novas execuções. Throttling térmico, carga de outros processos e apresentação física não foram confirmados. A aba estava visível/focada nas amostras; a pausa automática permaneceu intacta. Isso não exclui perda de foco entre observações. O runner final também registra chamadas de pause/resume, além de polling. Não usamos os 59Hz reportados pelo Windows para converter callbacks em frames apresentados.

Commit `5da833c518767fabaafc8123962754a7c04ac043`, com muitas alterações locais pré-existentes; cada JSON preserva `git status --short`. Configuração completa de `GAME_CONFIG`/`COMBAT_CONFIG`, geometria, backend e dimensões constam de `environment.game`: seed efetiva 42, duração 180s, spawn 5s, debug desligado, áudio ligado/volume 0,45, mundo 4000 × 4000, limite configurado 43 inimigos. Somente a entropia da seed foi controlada. W/A/D, Space/Q/E e R foram enviados pelo teclado real do Playwright; desvio de terreno foi calculado em Node. Não houve injeção de entidades, alteração de HP/clock ou desativação de regras.

## Três minutos de combate

[Dados brutos](docs/performance/runs/2026-10-03T09-32-53-856Z/measurements.json), [resumo e intervalos de 10s](docs/performance/runs/2026-10-03T09-32-53-856Z/summary.json), [gráficos](docs/performance/runs/2026-10-03T09-32-53-856Z/charts.svg), [captura posterior](docs/performance/runs/2026-10-03T09-32-53-856Z/after-combat.png).

| Métrica | Resultado |
| --- | ---: |
| Duração final / janela de intervalos | 180s / 179,9213s |
| Intervalos rAF / FPS médio | 10.739 / 59,6872 |
| p95 / máximo entre callbacks | 16,8ms / 184ms |
| Intervalos >16,67 / >33,33 / >50ms | 9.619 / 8 / 1 |
| Chamadas de renderização / frequência | 10.739 / 59,6872 por segundo |
| Passos de simulação / média por frame | 10.795 / 1,0052 |
| Máximo de passos / backlog observado | 12 / 16,633ms |
| CPU de `World.update`, média / p95 / máximo por frame | 2,156 / 2,9 / 197,5ms |
| CPU de envio ao renderer, média / p95 | 0,196 / 0,300ms |
| `Game.start` na primeira partida | 422,1ms |
| Pico de entidades amostradas, incluindo ilhas | 86 |

FPS = intervalos × 1000 / soma dos intervalos; p95 usa nearest rank. Frames lentos não foram removidos. As excedências de 16,67ms são principalmente intervalos próximos de 16,7–16,8ms, não milhares de grandes travamentos. Os dados diferenciam rAF, passos e chamadas ao renderer: **envio de trabalho não comprova apresentação física nem mede duração GPU**. `FixedStep` retém backlog, limita cada frame a 12 passos e não descarta tempo ativo. Não foi observado backlog sustentado.

Startup ficou separado do combate. Os 422,1ms medem `Game.start`/assets/Pixi; construção de `World`, imports e React anteriores ao método ficaram fora desse cronômetro. O runner final também registra clique→pronto. O pico frio de 197,5ms durante combate foi mantido no FPS.

| Entidade | Média amostrada | Máximo amostrado |
| --- | ---: | ---: |
| Chasers / shooters | 19,94 / 19,92 | 20 / 20 |
| Navios, incluindo jogador | 40,87 | 41 |
| Projéteis / efeitos | 1,56 / 2,26 | 8 / 8 |
| Wrecks / ilhas | 0,08 / 37 | 1 / 37 |
| Inimigos em CHASE/APPROACH/ATTACK | 0,46 | 2 |

Amostras por segundo de jogo podem perder picos transitórios. Houve dano (HP mínimo amostrado 10), perseguição, disparos, colisões, destruições e efeitos, com navegação/pathfinding ativos. É combate leve, não todos os inimigos atacando simultaneamente. O primeiro intervalo de 10s ficou em 58,68/s; os demais entre 59,49 e 59,79/s. As tentativas `09-24-10` e `09-26-55` morreram em 13,13s e 14,32s: foram preservadas como incompletas.

## Causas e profiling separado

Coleta de aproximadamente 30s com CPU profiler, timeline e wrappers detalhados; seus FPS não substituem a medição principal. [CPU](docs/performance/runs/2026-10-03T09-37-22-335Z/combat.cpuprofile), [mapeamento para fonte](docs/performance/runs/2026-10-03T09-37-22-335Z/cpu-summary.json), [timeline](docs/performance/runs/2026-10-03T09-37-22-335Z/timeline.json), [resumo da timeline](docs/performance/runs/2026-10-03T09-37-22-335Z/timeline-summary.json), [contadores](docs/performance/runs/2026-10-03T09-37-22-335Z/measurements.json). Eventos aninhados e threads diferentes não devem ser somados como tempo CPU/GPU total.

- **Geometria confirmada:** 1,721s de self time amostrado em `CollisionSystem.ts`; `circleOverlapsPolygon` 430ms, `bounds` 298ms, `sweepCollider` 251ms. `World.canEnemyPose`: 144.282 chamadas, 796ms inclusivos instrumentados. `clearPoseSegment`/`canTurnTo` fazem repetidas consultas de círculos/ângulos contra terreno. Bounds já são cacheados; ainda há muitos candidatos/testes.
- **Pico frio confirmado:** `NavigationGrid.component` somou 205,8ms em 166 chamadas, concentrados na construção inicial por busca exaustiva. Maior `FireAnimationFrame` no trace: 214,4ms. Não há evidência de A* sendo gargalo sustentado neste cenário. `planCount`/estado de rota por inimigo estão nas amostras; a soma dos vivos não conta buscas de inimigos já removidos.
- **Desvio confirmado:** `EnemySystem.avoidNeighbors`, 120,7ms de self time, calcula predição antes de rejeitar pares além de 160 unidades. Toda a população é simulada fora da câmera; culling visual não reduz IA/colisões.
- **Render/HUD sem gargalo recorrente demonstrado:** 12.808 `drawElements` e 14.118 `bindTexture`, cerca de 7 draws por atualização visual. Binds não são mudanças efetivas de textura; overdraw não foi medido. `WorldRenderer.render`: 124,7ms; combat/damage/health: 58,6/17,4/16,1ms, inclusos no primeiro total. HUD: 300 publicações/16ms e 300 eventos `UpdateLayoutTree`; não são commits React exatos. Barras já atualizam Graphics quando HP muda; ilhas já usam texturas geradas no startup e culling. Não há motivo medido para reduzir qualidade/HUD.
- **Alocação/GC:** 331 MinorGC (344,5ms agregados, máximo 5,034ms) e 12 MajorGC (23,7ms agregados). CPU sampling: 401ms em GC. `getPlayerColliders` teve 117ms de self time e aloca arrays/objetos; profiler/controlador também alocam. Sem allocation profile por função, não atribuímos todos os GCs ao hull nem recomendamos pooling genérico.
- **Áudio/rede:** 244 `ResourceSendRequest`, principalmente WAVs: 60 cannon fire e 70 colisão. `playSound` redefine `voice.src` em reutilizações; requests não comprovam downloads, pois podem usar cache/ranges. Self time de áudio: 29ms. Seis `TimerFire`: 512µs agregados. Storage não foi isolado. Retenção MSW está investigada separadamente na seção de memória.
- **Ambiente/GPU:** 22,852s de samples em idle e 3,221s em `(program)`; o segundo não identifica função. CPU JS não saturou 16,67ms recorrentemente. Não foram medidos GPU timestamps, VRAM, utilização física ou overdraw. DPR 2, resolução maior e combate mais denso são hipóteses de custo adicional, não causas provadas deste resultado.

## Comparação histórica e overhead

Os 28,15 FPS históricos usaram SwiftShader confirmado, headless, áudio mudo e jogador parado sem engajamento. Agora houve RTX/D3D11, janela, áudio e navegação. Backend gráfico é uma contribuição externa relevante; não explica automaticamente toda a diferença, porque build, IA e carga também mudaram. Headless não significa software rendering.

[Calibração bruta](docs/performance/runs/2026-10-03T10-05-10-085Z-calibration/calibration.json): três ensaios sequenciais de 20s no build atual, mesma seed/configuração e sequência gravada de teclas. Um coletor rAF leve é comum a todos; sem screenshots, trace ou CPU samples durante a janela.

| Condição, sempre com janela | FPS rAF | p95 |
| --- | ---: | ---: |
| D3D11, sem observador completo | 59,19 | 16,8ms |
| D3D11, observador básico | 59,79 | 16,8ms |
| SwiftShader forçado, observador básico | 20,80 | 50,3ms |

Ensaios únicos, sem significância estatística: o observador ter ficado mais rápido indica variação, não benefício/overhead zero. Trajetórias podem divergir com o mesmo input e cadências diferentes. SwiftShader foi confirmado por `glRenderer`; `--use-angle=swiftshader --enable-unsafe-swiftshader` foram flags exclusivas do diagnóstico. Não medimos overhead do coletor comum. Isso reforça o efeito do ambiente sem atribuir os 28 FPS exclusivamente a ele.

## Memória após cinco ciclos

Referência final: [dados](docs/performance/runs/2026-10-03T10-39-47-040Z/measurements.json), [resumo](docs/performance/runs/2026-10-03T10-39-47-040Z/summary.json), [gráfico de memória](docs/performance/runs/2026-10-03T10-39-47-040Z/memory-chart.svg), [categorias do heap](docs/performance/runs/2026-10-03T10-39-47-040Z/heap-summary.json), [retenções antes](docs/performance/runs/2026-10-03T10-39-47-040Z/warm-baseline-retainers.json) e [depois](docs/performance/runs/2026-10-03T10-39-47-040Z/after-five-cycles-retainers.json). Aquecimento de 15,02s e cinco ciclos completos de iniciar→jogar 15s→pausar/sair→menu, com seed/configuração iguais. Duração efetiva entre 15,00 e 15,083s pela granularidade de inputs/steps; estabilização sempre 5s. Nenhuma pausa involuntária ou erro registrado.

| Estado | Combate ativo | Pico JS amostrado, MiB | JS após 5s no menu, MiB | DOM nodes / listeners | Canvas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Menu aquecido, antes de snapshot | — | — | 25,80 | 348 / 310 | 0 |
| Ciclo 1 | 15,050s | 34,29 | 10,02 | 176 / 203 | 0 |
| Ciclo 2 | 15,033s | 43,91 | 29,33 | 350 / 428 | 0 |
| Ciclo 3 | 15,083s | 38,11 | 25,38 | 350 / 468 | 0 |
| Ciclo 4 | 15,000s | 35,97 | 33,80 | 350 / 466 | 0 |
| Ciclo 5 | 15,017s | 41,88 | 29,80 | 350 / 458 | 0 |

Picos são amostras aproximadamente por segundo, não máximos absolutos nem RSS. Leituras normais não forçam GC por ciclo. **Diagnóstico separado:** snapshot baseline e `Runtime.queryObjects` antes dos ciclos podem provocar GC; a sequência não é totalmente sem intervenção. Depois dos ciclos houve snapshot e `collectGarbage`. JS após snapshot baseline: **8,67MiB**; após diagnóstico final: **10,90MiB**, aumento aproximado **2,22MiB**. DOM/listeners finais **176/203**: boa parte das contagens normais era temporária. Heap normal não cresceu monotonicamente; sozinho não prova vazamento nem ausência dele.

| Instâncias observadas por prototype, após GC | Baseline | Após ciclo 5 |
| --- | ---: | ---: |
| Game / World | 0 / 0 | 0 / 0 |
| Container / Sprite | 5 / 0 | 5 / 0 |
| Texture / Ticker | 62 / 1 | 62 / 1 |
| HTMLAudioElement | 9 | 9 |

Contagens não abrangem todos os recursos nativos/GPU. Container pode incluir subclasses; Texture objects não equivalem a entradas de cache ou bytes de VRAM. No combate observamos árvore de containers/sprites, cache compartilhado, texturas próprias, efeitos e entidades. Contagens pós-GC estáveis sustentam liberação do ciclo Game/Pixi observado, não estabilidade ilimitada. Timers ativos e listeners por proprietário não foram contados exaustivamente.

**Retenção confirmada:** MessageEvent **276→1.057** e MessagePort **413→1.574** sobrevivem ao GC. Caminhos fortes: `ServiceWorkerContainer → listener → WorkerChannel.getWorker → ServiceWorkerSource.workerPromise → PromiseReaction → Generator → MessageEvent`. O MSW instalado cria um source/listener no inicializador `defaultNetworkOptions`; `setupWorker.start` usa outro source. Hipótese forte: o source padrão não utilizado aguarda uma promise nunca resolvida e acumula mensagens, especialmente com requests de áudio. O caminho é confirmado; atribuir causalmente ao inicializador requer o ensaio isolado proposto em P0. Roots do debugger e `NetworkResourcesData` também aparecem; não atribuímos toda retenção nativa a um único responsável.

JIT cresceu: `InstructionStream` +740.800 bytes, `TrustedByteArray` +154.832, `FeedbackVector` +64.196. Isso explica parte, não todo o crescimento. Self-size total do snapshot cresceu 3.581.837 bytes, incluindo categorias nativas; não é intercambiável com `Runtime.getHeapUsage`. Memória GPU não foi inferida pelo heap JS.

Lotes preservados: `09-38-52` teve aquecimento interrompido aos 93,53s e quinto ciclo de 30s interrompido aos 19,15s; não são cinco durações iguais. `09-45-15` concluiu cinco ciclos de 15s, mas o aquecimento morreu aos 21,17s. Esses observadores ainda retinham o último recording até nova coleta. O observador final libera arrays após exportação; repetimos `10-39-47` após esse ajuste de instrumentação, com aquecimento e todos os ciclos completos. Não é otimização de produção. **Cinco ciclos de 15s não demonstram segurança após cinco partidas de 180s**; essa extensão continua necessária.

## Reproduzir

```powershell
npm run build -- --sourcemap
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
# Outro terminal; um navegador por vez, aba visível e focada:
npm run profile:reference
npm run profile:cpu
npm run profile:memory -- --seconds=15 --cycle-seconds=15
npm run profile:summarize
node scripts/summarize-heaps.mjs docs/performance/runs/<memory-run>
node scripts/inspect-retainers.mjs docs/performance/runs/<memory-run>/after-five-cycles.heapsnapshot
npm run profile:calibrate -- docs/performance/runs/<cpu-run>/measurements.json
```

`PROFILE_URL` altera origem. `--seconds`/`--cycle-seconds` ou `PROFILE_SECONDS`/`PROFILE_CYCLE_SECONDS` alteram durações; coleta curta não comprova três minutos. `--headless` é comparativo. Morte/pausa interrompem a coleta sem mudar regras; dados são preservados. `complete` indica partida de 180s terminada; `reachedRequestedDuration` identifica janela curta concluída. Pastas usam UTC; usuário em America/Sao_Paulo. Uma nova tentativa pode ser necessária se o controlador morrer.

Cada execução tem pasta própria. `profile:combat` histórico agora salva em `legacy-runs/<timestamp>` e não sobrescreve a evidência antiga. Snapshots completos ficam locais/gitignored; resumos e caminhos de retenção são versionáveis. Abra CPU/timeline em DevTools Performance e snapshots em Memory. O mapeamento source map foi salvo no resumo CPU; guarde os maps correspondentes para remapear após novos builds.

Faltam várias seeds, engajamento denso, DPR 2/resoluções maiores, cinco partidas completas repetidas, áudio/cache por mais tempo e execução manual sem CDP. RSS/VRAM, refresh físico, throttling térmico, allocation profile por função e contagem exata de timers/listeners por proprietário não foram medidos. A automação não cobre toda a variedade de um jogador humano. Build otimizado com sourcemaps, typecheck, lint e sintaxe dos runners passaram. Essas verificações não comprovam ausência de vazamentos. [Hashes da instrumentação final](docs/performance/instrumentation-hashes.json) identificam a versão entregue; não são hashes das revisões históricas.

---

# Evidência histórica preservada

Measured 2026-10-02, before the current correction. No FPS/memory study was repeated on 2026-10-03. The 60 FPS target (16.67 ms frame budget) was not achieved in the measured environment; these figures are not a guarantee for other devices or the current build.

## Environment and method

Windows 10.0.26200, Intel Core i3-12100F, 17,010,458,624 bytes physical RAM (15.84 GiB), physical NVIDIA RTX 3060 with driver 32.0.15.9579. Headless Chromium 153.0.8010.12, viewport 1280 × 720 CSS pixels, DPR 1. The actual renderer reported ANGLE/SwiftShader with GPU composition/rasterization disabled; the physical RTX was not used.

Optimized TypeScript/Vite build served by preview without HMR; actual React/HUD/MSW. Seed 42, configured duration 180s, respawn 5s, debug off, audio muted. Real Playwright Space/Q/E inputs fired continuously while the player stayed at initial spawn. Enemy patrol/vision/collision/firing rules remained active; HP and gameplay clock were not altered.

The opt-in `?profile=1` observer releases its Game reference on exit. requestAnimationFrame intervals were collected in real time after assets/canvas were ready. FPS = interval count × 1000 / summed interval milliseconds; p95 uses nearest rank. These intervals approximate callback cadence, not physical presentation or isolated GPU/simulation time. Entity counts were sampled each simulated second and can miss transient peaks. Decoration sprites/cannons/hull circles are not separate simulation entities.

Five subsequent cycles in one warmed page/context played five seconds with firing, then paused/exited. Each exit ran CDP HeapProfiler.collectGarbage, Runtime.getHeapUsage and Memory.getDOMCounters. Cycle zero was the warm reference after the long match. [Raw measurements](docs/performance/measurements.json), [completion capture](docs/performance/combat.png), [runner](scripts/profile-combat.mjs).

## Results

| Metric | Historical result |
| --- | ---: |
| Configured/completed match | 180s |
| Callback collection window | 177.44s |
| Frame intervals | 4,992 |
| Mean FPS | 28.15 |
| p95 interval | 50.00ms |
| Peak sampled entities | 78 |
| Page JavaScript errors | 0 |

First sample: 1.80 simulated seconds; last per-second sample: 179.02s. The completion image shows 180s / Time Expired. frames.final was null because real result navigation destroyed Game. The runner now also captures the persisted result. The first approximately 1.8s lack frame intervals.

Peak sample: 37 islands, 29 ships (player plus 28 enemies), seven projectiles, five effects, no wrecks. HP stayed 100, score zero; no enemy engagement occurred. The contemporaneous notes referred to a 48-enemy ceiling; that historical value is not current configuration (now 43).

| Exit | JS heap MiB | DOM nodes | JS listeners | Canvas |
| --- | ---: | ---: | ---: | ---: |
| Warm reference | 8.35 | 103 | 216 | 0 |
| Cycle 1 | 8.76 | 103 | 212 | 0 |
| Cycle 2 | 8.99 | 103 | 212 | 0 |
| Cycle 3 | 9.20 | 103 | 212 | 0 |
| Cycle 4 | 9.33 | 103 | 212 | 0 |
| Cycle 5 | 9.44 | 103 | 212 | 0 |

Heap grew 1,139,060 bytes (1.09 MiB, approximately 13%) after GC. Per-cycle increments were 430,076 / 246,448 / 216,824 / 137,108 / 108,604 bytes. DOM/listeners/canvas did not progressively grow; this does not prove absence of leaks.

## Complementary historical memory/CPU collection

[Snapshot/count summary](docs/performance/memory-investigation/measurements.json) and [15s CPU profile](docs/performance/memory-investigation/combat.cpuprofile) use a fresh page in the same optimized build without concurrent tests. After five cycles, heap rose from 8,795,256 to 9,857,584 bytes (+1,062,328). Runtime.queryObjects found zero Game and World instances both after reference exit and after cycle five.

Largest self-size growth: InstructionStream +668,736, TrustedByteArray +116,404, FeedbackVector +60,132, LoadHandler +49,016, Code +46,296 and code WeakFixedArray +44,336 bytes. These approximately 985KB of V8 code/metadata support the inference that JIT warm-up explains much of the growth, not an attribution of every byte. Native events, message buffers and shader/cache strings also grew; this was category/count analysis rather than every retaining path.

Listeners remained 212; canvas zero. DOM nodes rose from 103 to 164 in cycle one and stayed there through the next four; its exact cause was not established. Snapshot instrumentation differed from the long collection.

The CPU profile contains 4,906 samples over 15.37s. Approximately 86.9% of hit counts were in (program), which does not identify a game function. Named functions include collision/canEnemyPose; GC represented approximately 0.45%. This cannot attribute 28 FPS solely to simulation. SwiftShader is a material limitation; GPU-accelerated main/render/GPU timelines remain needed.

## Reproduction and limitations

Build, then serve `npm run preview -- --host 127.0.0.1 --port 4175 --strictPort`. In another terminal run `npm run profile:combat`, without concurrent tests. PROFILE_URL changes the origin; PROFILE_SECONDS shortens smoke collection but cannot establish a three-minute requirement. The runner formerly overwrote the primary JSON/capture; it now writes a timestamped legacy-runs directory. Chromium must be installed with `npx playwright install chromium` if absent. These commands are preserved for later work, not run for this correction.

`npm run profile:combat -- --memory` uses a separate 15s CPU window and five exit cycles under `docs/performance/memory-investigation`. Complete local heapsnapshots remain gitignored; summary JSON and cpuprofile preserve evidence. Runtime.queryObjects uses actual prototypes, avoiding minified-name assumptions. Profiling overhead makes that mode unsuitable for FPS comparisons.

One seed/resolution, stationary safe spawn, audio muted, DPR 1, headless Chromium, no stress scenario of every enemy attacking. Physical mobile, audio on, DPR 2, visible/GPU-accelerated browser and CDN startup remain unmeasured. JS heap/DOM do not measure all GPU/native/driver/RSS memory. Five five-second cycles do not establish indefinite cache stabilization or full-match resource safety. Asset error paths were not covered in this historical collection; the current lifecycle correction has separate functional tests. See [CODE_REVIEW.md](CODE_REVIEW.md).
