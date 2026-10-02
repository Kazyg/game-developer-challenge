# Ajustes de navios, mapa e controles

## Navios e afundamento

Os sprites reais de `assets/png/default/ships` foram inspecionados. As sequências são:

| Tipo | HP > 60% | 30% < HP ≤ 60% | 0 < HP ≤ 30% | Destruído |
| --- | --- | --- | --- | --- |
| Player | ship_1 | ship_7 | ship_13 | ship_19 |
| Chaser | ship_3 | ship_9 | ship_15 | ship_21 |
| Shooter | ship_5 | ship_11 | ship_17 | ship_23 |

Todas as texturas são carregadas antes do início da partida. A troca atualiza `Sprite.texture`, mantendo o mesmo sprite, entidade, pose, escala e collider. As bandeiras usam sempre o mesmo asset por tipo, inclusive no wreck: `flag_1`, `flag_3` e `flag_5`. Os overlays anteriores de casco/vela foram substituídos pela progressão dos navios completos; fogo e canhões continuam visuais.

A morte cria um snapshot visual de posição, rotação e tipo. O navio fica DEAD imediatamente; o snapshot não é entidade, não tem collider/AI/ataques nem participa de score. O casco destruído permanece por 3 segundos, desce 20 unidades, reduz discretamente a escala e desaparece com fade. A destruição por contato do Chaser continua sem score. Health bars desaparecem na morte. Na derrota do Player, somente os efeitos finais são animados durante esses 3 segundos; a simulação fica congelada.

Arquivos: `ShipAppearance.ts`, `ShipTextures.ts`, `WorldRenderer.ts`, `CombatRenderer.ts`, `DamageRenderer.ts`, `CombatSystem.ts`, `World.ts`, `Combat.ts`, `Game.ts` e configurações.

## Ilhas e áreas

O tamanho gerado das ilhas passou de 120–360 para 200–460. O mesmo contorno e tamanho alimentam a textura e o collider de terra. A variedade de formas, baía côncava, península, praias e espaçamento mínimo de 140 continuam preservados. A validação de mapas inclui várias seeds e verifica a região inicial segura.

Decoração utiliza assets reais de `assets/png/default/tiles`: areia com detalhes (`68`), grama (`23`), vegetação maior (`70/72`), vegetação rasteira (`87/88`) e pedras pequenas (`49/51`). Uma malha com jitter determinístico forma grupos de vegetação no interior; pedras ficam na faixa costeira. A seed de cada ilha inclui a seed da partida e seu índice, sem interferir no RNG de gameplay. Água rasa (`tile_27`) permanece sob uma máscara visual, fora dos colliders. Cada ilha recebe sua própria textura decorada, com cleanup na destruição do renderer.

As Patrol/Spawn Areas aumentaram de 8 para 24, uma por setor em uma grade 5×5, excluindo o setor central do Player. Ordem e posição dentro de cada setor variam pela seed. O debug U desenha todas as áreas. O spawn continua sendo de no máximo um inimigo por intervalo de `Enemy Spawn Time`, com posição segura e no máximo um inimigo por tipo em cada área. A população global permanece limitada a 16; mais áreas não aumentam esse limite.

Arquivos: `GameConfig.ts`, `CombatConfig.ts`, `IslandDecorations.ts`, `WorldRenderer.ts` e `SpawnSystem.ts`.

## HUD

Os controles agora recebem Pointer Events no desktop e no touch. Forward/A/D permanecem ativos enquanto pressionados; pointer capture mantém o hold ao mover o ponteiro para fora. Up, cancel, perda de capture, pause e blur liberam inputs. IDs independentes permitem Forward + Rotate + Broadside simultaneamente. Cliques rápidos em armas são preservados até o próximo passo de simulação; cancelamento elimina pedidos ainda não consumidos. Teclado e HUD continuam usando o mesmo InputManager e regras existentes de Repair/cooldown.

Os assets normal/pressed existentes representam o estado do botão. O estado ativo também acompanha o teclado; ataques e Repair mostram um overlay circular e segundos restantes de cooldown. Loading, pause e morte desabilitam os comandos. O botão Pause mantém a mesma ação do Escape.

Arquivos: `InputManager.ts`, `Game.ts`, `GameScreen.tsx` e `GameScreen.css`.

## Verificação

`tests/adjustments.spec.ts` cobre thresholds e sequências, troca sem recriação, bandeira/collider invariáveis, wreck e cleanup, score único, freeze em pause, áreas distribuídas, limite populacional, ilhas maiores e decoração por região. O teste de browser verifica hold com mouse, Forward + Rotate via fontes combinadas, cliques rápidos nas três armas, Repair, cooldown, disabled, Pause e debug. O teste mobile em `tests/polish.spec.ts` usa três contatos reais do Chromium para Forward + Rotate Left + Right Broadside e verifica cancelamento e feedback.

Validação mobile usa emulação Chromium, sem hardware físico. Capturas para revisão estão em `test-results/adjustments-review-*.png`. A rodada preserva os sistemas não relacionados.

Resultado: typecheck e lint passaram, sem erros ou warnings de lint; a suíte completa passou com **80 testes** e o teste do build publicado também passou. O build foi gerado com sucesso, com o aviso informativo do Vite sobre o tamanho do chunk principal. Não ficou nenhum ajuste solicitado pendente.
