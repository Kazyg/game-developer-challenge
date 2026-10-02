# Pirate Battle: inimigos e combate

Todos os valores de combate e bindings estão em
`src/game/config/CombatConfig.ts`. Movimento e mundo continuam em `GameConfig.ts`.

## Controles

- WASD: deslocamento, incluindo diagonais normalizadas.
- Espaço: tiro frontal (1 projétil; cooldown 1s).
- Q: lateral esquerda (3 projéteis; cooldown 2.5s).
- E: lateral direita (3 projéteis; cooldown 2.5s).
- R: inicia Repair quando parado, com HP incompleto e fora do cooldown.
- U: alterna debug de colisores, áreas de patrulha, visão e alcance de ataque.

Segurar as teclas de disparo repete os ataques quando o cooldown da arma termina.
Repair usa uma solicitação por pressionamento, sem reativação automática por
segurar R. Movimento e disparos funcionam simultaneamente.

## Armas, vida e Repair

O jogador tem 100 HP. Cada cannonball do jogador causa 20 de dano, ajustável.
Chasers têm 40 HP; Shooters, 60 HP. Cada tiro inimigo causa 10 de dano.

Cada um dos três projéteis laterais tem ID, posição, direção, collider, dano,
owner/team, velocidade, idade, lifetime, distância e alcance próprios. Acertar
um alvo remove somente aquele projétil e aplica somente seu dano. Os restantes
continuam. Não há colisão com o owner nem friendly fire. Ilhas, impactos, limites,
lifetime e alcance encerram o projétil; passos curtos impedem atravessar terreno.

As três armas possuem cooldowns independentes para cada navio. Muzzles e
direções laterais usam a orientação lógica do casco, independente do sprite.

Repair cura até 50 HP a 10 HP/s durante no máximo 5s, sem ultrapassar 100 HP.
Qualquer tecla de movimento cancela o reparo, mesmo se o barco estiver bloqueado
ou as teclas forem opostas. Qualquer dano também o cancela imediatamente.
A vida já curada é preservada; a interrupção ou conclusão inicia 30s de cooldown.
Chegar ao HP máximo encerra o reparo e inicia o mesmo cooldown.

Quando um navio chega a 0 HP, ele deixa de mover, atacar e participar das
colisões. Sua explosão visual continua por tempo limitado, sem aplicar dano.
A morte do jogador interrompe imediatamente a simulação e abre Game Over. Play Again cria uma partida nova, com mundo, vida, timers e cooldowns limpos; Main Menu volta ao menu e destrói o PixiJS.
O HUD exibe HP, cooldowns das armas e estado do reparo; os inimigos já possuem
HP/maxHp na simulação. Barras de vida acima dos navios usam os frames e fills existentes em ui/hud, com máscara proporcional ao HP, orientação fixa e remoção ao morrer.

## Áreas, spawn e IA

A seed gera 24 setores de patrulha de 640 × 640 unidades, com um Chaser e um Shooter em cada setor desde o início da partida.
Cada uma permite no máximo um Chaser e um Shooter vivos. Não há ponto fixo:
cada tentativa sorteia uma posição dentro da área, respeitando espaço para o
casco, mundo, ilhas, outros inimigos e distância de 450 unidades do jogador.
São feitas até 64 tentativas por tipo; somente uma falha em todas adia o spawn
por 2s. A morte libera seu tipo para respawn após 12s. Esses valores são ajustáveis.

Áreas, posições e destinos usam geradores derivados da seed, separados do PRNG
das ilhas. A geração existente do terreno não foi alterada. Mesma seed e mesma
sequência de inputs/delta times reproduzem a simulação. Resize não participa dela.

Chaser inicia perseguição quando o jogador entra no alcance de visão de 300 unidades.
Ao contato com o jogador, causa 40 de dano uma vez e morre imediatamente.

Shooter usa a mesma visão de 300 unidades, aproxima e ataca a até
220 unidades. O ângulo relativo decide frontal, esquerda ou direita; se nenhuma
arma estiver alinhada, ele vira suavemente para o alvo. As armas mantêm seus
cooldowns próprios e os projéteis sempre viajam segundo a direção do canhão.

Steering local separa navios próximos e favorece passagem lateral quando há
alguém à frente. A validação física dos sete círculos do casco impede atravessar
outros inimigos, ilhas e bordas, tanto ao deslocar quanto ao girar. Isso funciona
em patrulha, perseguição e aproximação/ataque. Não há pathfinding global: ilhas
são contornadas usando sondagem do caminho e waypoints tangenciais temporários em CHASE, APPROACH e RETURN. A direção do contorno permanece estável, com inversão se houver falta de progresso. Cada navio mantém um círculo de patrulha (centro, raio e sentido) definido pela seed no spawn. Após RETURN, ele se reintegra à órbita.

## Assets e renderização

Assets PNG retina inspecionados e reutilizados:

- `ships/ship_3.png`: Chaser vermelho; `ships/ship_5.png`: Shooter azul.
- `ship_parts/cannon_ball.png`: projéteis.
- `effects/fire_1.png`: feedback do disparo.
- `effects/explosion_3.png`: impacto.
- `effects/explosion_1.png`, `explosion_2.png`, `explosion_3.png`: destruição.

Todos os caminhos acima são relativos a `assets/png/retina/`. Os navios possuem
as mesmas dimensões do jogador e reutilizam seus círculos de casco e offset de PI.
`CombatRenderer` mantém sprites por ID e os remove quando suas entidades/efeitos
terminam. O dano nunca depende de sprites, efeitos ou Graphics.

No debug, ilhas são rosa; jogador, amarelo; Chasers, laranja; Shooters, azul;
áreas, roxo; alcance de ataque, dourado. Projéteis do jogador são brancos e os
inimigos vermelhos. Contornos sem preenchimento usam os colliders e ranges reais. O debug também mostra o leash: o retângulo da Patrol Area ampliado em 750 unidades. Sair dele em perseguição ativa RETURN com visão reduzida de 90 unidades. Aproximar o jogador nesse alcance reativa perseguição; chegar à Patrol Area retoma PATROL. Ambos restauram a visão normal de 300 unidades.

## Arquivos e validação

Criados: `config/CombatConfig.ts`, `entities/Combat.ts`, `entities/Enemy.ts`,
`combat/CombatSystem.ts`, `combat/RepairSystem.ts`, `world/SpawnSystem.ts`,
`ai/EnemySystem.ts`, `movement/ShipMovement.ts`, `rendering/CombatRenderer.ts`,
`tests/combat.spec.ts` e `tests/combat-browser.spec.ts`.

Integrados: `World.ts`, `Player.ts`, `InputManager.ts`, `WorldRenderer.ts`,
`Game.ts`, `GameScreen.tsx` e seu CSS. Testes anteriores de geometria usam
`World(seed, { combatEnabled: false })` para isolar a arena da nova simulação.

Verificação: `npm run build` (inclui TypeScript strict), `npm run lint`,
`npx playwright test`. Os testes cobrem impactos individuais, cooldowns,
Repair, morte, IA, spawn bloqueado e alternativo, colisão entre navios/ilhas,
determinismo, bindings reais, debug U, resize e cleanup.

Ranking, histórico, vento e sons não fazem parte desta etapa.

Rotação configurável: jogador 240°/s em GameConfig; Chaser 120°/s e Shooter 100°/s em CombatConfig. Visão, leash e parâmetros de desvio também ficam em CombatConfig.


