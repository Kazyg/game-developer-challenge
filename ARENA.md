# Pirate Battle: base da arena

A integração de inimigos, armas e Repair está documentada em [COMBAT.md](COMBAT.md).

Execute `npm run dev` e entre em `/game`. W/S movem para norte/sul;
A/D para oeste/leste. Combine duas teclas para navegar em diagonal.
`npm run build` verifica TypeScript strict e gera o build. `npm run lint`
verifica lint e `npx playwright test` executa testes de lógica e navegador.

## Seed e mundo

Uma nova montagem da tela cria uma seed uint32 usando `crypto.getRandomValues`.
Para reproduzir uma partida, abra `/game?seed=42` (0 a 4294967295).
A seed aparece no HUD e no atributo `data-seed` da tela. Durante a partida,
ela fica no estado React e no `World`; resize não a modifica.

Mulberry32 produz todas as escolhas do mapa: quantidade, posição, tamanho,
variante e orientação das ilhas. Há cinco contornos contínuos: arredondados,
alongados e irregulares, com areia ou vegetação, e tamanhos de 120 a 360 unidades.
O gerador tenta posicionar 24 a 36 ilhas, respeitando os
limites, um corredor mínimo de 140 unidades entre colliders e uma região
segura de 400 unidades ao redor do spawn. Há um limite de tentativas com erro
explícito se não houver espaço. O mundo permanece em 4000 × 4000 unidades.

## Simulação e câmera

`World` guarda jogador, ilhas e colliders em coordenadas do mundo. O vetor WASD
é normalizado, evitando velocidade maior na diagonal. O deslocamento acompanha
o input diretamente, independentemente da orientação atual do navio. Movimento
usa segundos decorridos, com delta limitado após pausas e passos de no máximo
8 unidades para evitar atravessar obstáculos. A movimentação testa X e Y
separadamente para permitir deslizamento. O jogador permanece dentro do mundo.

A rotação alvo é `atan2(direction.x, -direction.y)`: zero significa norte.
`shortestAngleDifference` normaliza a diferença angular com seno/cosseno,
e `turnTowards` limita o giro a `playerRotationSpeed * deltaTime`, inclusive ao
atravessar -PI/+PI. Sem input, posição e orientação são mantidas.

Cada ilha possui `colliders`, com um polígono de 32 vértices que representa sua
costa, transformado por posição, escala uniforme e orientação. Os sete círculos
do casco são testados contra o interior e as arestas desse polígono, sem consultar
sprites nem pixels. `boundingRadius` serve somente para espaçamento do mapa e
visibilidade; não bloqueia o jogador na água ao redor da costa.

`Camera` calcula um deslocamento limitado às bordas do mundo. `WorldRenderer`
move seu Container pelo negativo desse deslocamento; posições lógicas nunca
mudam por causa da câmera. Ilhas fora da viewport ficam invisíveis. Não há zoom.

`ResizeObserver` redimensiona apenas o renderer e atualiza a câmera, mantendo
a mesma simulação, seed, mapa e canvas. O renderer usa `devicePixelRatio`.
Em uma viewport excepcionalmente maior que 4000 unidades, o canvas fica
limitado ao tamanho do mundo, centralizado, sem reduzir a escala.

## Assets inspecionados e utilizados

- `assets/tilesheet/tilesheets.txt`: tiles default de 64 × 64 sem margem.
- `assets/tilesheet/tiles_sheet.png`: composição visual dos tiles.
- `assets/spritesheet/ships_miscellaneous_sheet.xml`: atlas de navios e peças.
- `assets/spritesheet/ui_sheet.json`: atlas da interface, reservado para depois.
- `assets/png/retina/tiles/tile_73.png`: oceano, repetido por um `TilingSprite`.
- `assets/png/retina/tiles/tile_18.png`: textura interna de areia.
- `assets/png/retina/tiles/tile_39.png`: textura interna de vegetação.
- `assets/png/retina/ships/ship_1.png`: jogador; a proa original aponta para sul.

O layout antigo com vegetação começava uma coluna antes da região correta do
tilesheet: selecionava 5–8/21–24/37–40/53–56, enquanto a composição completa
corresponde a 6–9/22–25/38–41/54–57. Isso misturava terreno incompatível.

Agora são usadas texturas internas, próprias para preencher terreno. Cada tile
é espelhado em uma grade 2 × 2 para unir bordas iguais e evitar emendas visíveis.
`TilingSprite` preenche máscaras poligonais contínuas; vegetação ocupa uma área
interna, deixando uma faixa de areia. Graphics apenas delimita máscaras e debug;
a aparência da terra vem dos PNGs reais. Os cinco contornos geram texturas
reutilizáveis, e seus sprites recebem somente escala uniforme e rotação.
Não há partes desconectadas nem escalas X/Y aleatórias.

O sprite usa `player.rotation + spriteRotationOffset`, com offset de PI,
mantendo a matemática de movimento independente da orientação do asset.
As texturas geradas são destruídas ao sair; as texturas de `Assets` permanecem
no cache compartilhado do PixiJS.

## Debug e verificação

Pressione U durante o jogo para alternar a visualização. As costas aparecem
em rosa e os círculos do casco em amarelo. `debugColliders` em
`src/game/config/GameConfig.ts` define a visibilidade inicial.
Esse Graphics nunca participa da simulação.

Os onze testes verificam 100 seeds, geometria transformada, WASD real de teclado,
oito direções com velocidade normalizada, independência de FPS, menor caminho
angular em -PI/+PI, repouso, colisão em todos os lados das variantes, sliding,
limites, resize, navegação e cleanup. Um teste de renderização verifica a
conectividade das cinco texturas, impedindo pedaços de terra desconectados.
A captura `test-results/island-variants-debug.png` mostra todas as variantes
e seus colliders; esses artefatos não são versionados.

## Lifecycle e decisões temporárias

React cuida da tela e HUD, `InputManager` do teclado, `World` da simulação,
`Camera` da visão e `WorldRenderer` do PixiJS. `Game` coordena essas partes.
Inicialização assíncrona cancelada pelo Strict Mode não anexa canvas nem ativa
input/ticker. Ao sair, listeners e observers são removidos, ticker parado,
texturas locais destruídas e Application/canvas removidos.

Os contornos são aproximações poligonais suaves, sem colisão pixel-perfect.
O casco usa sete círculos sobrepostos, configurados em `playerHullCircles` em
pixels do asset relativos ao centro do sprite. Eles acompanham a escala visual
e o offset de orientação. Tanto deslocamento quanto rotação validam o conjunto
inteiro contra as ilhas e os limites; uma rotação bloqueada mantém o ângulo atual.
Os círculos aproximam o casco, sem incluir as velas. Controles são de teclado.
O botão de finalizar conserva o fluxo anterior até a tela de resultado.
Esta documentação descreve a base da arena; veja COMBAT.md para o combate atual.

Em produção, o servidor deve encaminhar rotas como `/game` para `index.html`,
como o servidor de desenvolvimento do Vite já faz.
