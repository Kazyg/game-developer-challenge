# Navegação e IA naval

## Causa dos travamentos restantes

A primeira correção introduziu uma busca, mas ela parava no primeiro nó com visão do destino. Essa condição não garantia menor custo total. A grade tinha origem no barco e era reconstruída em cada busca, com limite de 2000 expansões; uma ilha grande podia resultar em rota parcial mesmo com destino alcançável. O recálculo dependia de deslocamento do destino, em vez de ocorrer periodicamente.

Outra causa era cinemática: um segmento livre com o casco já orientado não garantia que o barco pudesse fazer a curva. Atalhos e avanço de waypoints podiam levar o centro perto demais da costa e deixar a rotação bloqueada. O teste anterior de progresso também podia confundir deslocamento lateral com avanço pela rota.

## Planejamento atual

`NavigationGrid` é a representação compartilhada pela validação do mapa gerado e pelo planejamento em tempo de execução. A geração mantém sua amostragem de 64 px, raio do jogador e ordem de vizinhos cardinais. A IA usa uma grade fixa de 32 px, armazenada uma vez por World, com nós, conexões e componentes de água em cache. Aliados e posição do jogador não invalidam o mapa. Mudança dos colisores físicos invalida o cache para os cenários de teste.

A busca usa A* com fila de prioridade binária, custo euclidiano das conexões e heurística admissível. Os candidatos de chegada incluem o custo do último segmento até o destino; a busca só termina quando nenhuma alternativa na fronteira pode melhorar o custo completo. O menor custo no grafo foi comparado com Dijkstra independente em teste determinístico.

Os nós e conexões são inflados pelo raio envolvente real do inimigo (42,4 px) mais 3 px, dando espaço para rotacionar. Todas as conexões são varridas contra os mesmos colisores usados pela física. Diagonais exigem também vizinhos cardinais livres. A suavização só remove pontos quando o segmento inteiro é válido com essa folga; o trecho final e o caminho direto também verificam os círculos reais do casco orientado. Assim, um canal reto de 40 px continua disponível para o casco de 25,6 px de largura.

A busca de conectividade percorre o componente de água antes de classificar uma chegada como inacessível. Não há corte arbitrário por 2000 expansões. Quando não existe conexão até o alvo nesse grafo, escolhe-se o nó alcançável mais próximo e planeja-se até ele. A posição é reavaliada periodicamente.

O Shooter pode terminar o planejamento em um nó até 190 px do jogador, com linha de tiro livre. Não precisa planejar contato com o jogador. Ao entrar em ATTACK, retoma os arcos e tiros laterais existentes. O Chaser usa o ponto de interceptação suavizado, com a aproximação direta para impacto preservada.

## Seguimento, recálculo e recuperação

Cada inimigo guarda sua rota, próximo ponto, destino planejado e diagnóstico. Trechos desnecessários são abandonados assim que o caminho direto fica livre. Pontos já ultrapassados podem ser removidos quando o próximo trecho é totalmente seguro. A chegada desacelera proporcionalmente à distância ao waypoint, usando tolerância de meio raio envolvente ou duas distâncias de movimento por passo, o que for maior.

O recálculo normal ocorre a cada 0,75 s; a primeira fase é distribuída deterministicamente pelo ID e seed. Mudança de destino de pelo menos 60 px, rota inválida ou falta de progresso antecipam a busca. Uma rota válida permanece quando a alternativa só melhora marginalmente: a troca por benefício exige pelo menos 10% e 24 px. Uma busca sem resultado não inventa direção atravessando terreno nem elimina uma rota anterior ainda válida.

O progresso mede redução da distância restante por todos os pontos da rota. Rotação contínua ou oscilação não zeram essa janela. Após 2,5 s sem progresso, solicita-se nova validação e planejamento a partir da posição atual. A falta de deslocamento também é medida, com folga de 1,8 s para curvas legítimas.

Junto à costa, a IA verifica a rotação antes de tentar virar. Quando falta espaço, busca uma posição com folga em um segmento alinhado ao casco atual. Pode avançar ou recuar a 45% da velocidade base, em passos físicos normais, mantendo todos os colisores ativos. Movimento reverso conserva o cálculo de velocidade relativa no dano de contato.

Ao seguir uma rota, a validação mantém a folga para rotacionar; isso impede que uma curva em movimento destrua a margem reservada pelo planejador. O desvio local dos aliados permanece, mas só é aceito quando o trecho é seguro para o terreno, a curva cabe e mantém projeção de avanço de pelo menos 0,5 na direção da rota. Bloqueios físicos por terreno e aliados têm diagnósticos distintos; o desempate local pode trocar de lado após congestionamento, sem transformar aliados em obstáculos estáticos.

O debug existente mostra terreno físico em rosa, rota em verde, próximo ponto em branco, destino em amarelo (ou rosa quando inacessível no grafo) e afastamento costeiro em laranja. Não foram adicionados controles à interface normal.

## Parâmetros alterados nesta correção

| Parâmetro | Anterior | Atual |
| --- | --- | --- |
| Intervalo de recálculo | 1,5 s, condicionado à mudança do destino | 0,75 s, periódico e distribuído |
| Estrutura da grade | relativa ao barco e recriada | fixa e compartilhada por World |
| Limite da busca | 2000 expansões | componente navegável completo em cache |
| Tolerância de chegada | 24 px fixos | máximo entre 22,7 px e duas distâncias por passo |
| Troca por melhor custo | sem comparação da rota completa | melhoria mínima de 10% e 24 px |
| Sondagem de rotação | não havia | passos de π/24 rad |
| Recuperação costeira | recálculo e troca de lado | avanço/recuo físico, sondagem a cada 16 px até 640 px, fator de velocidade 0,45 |
| Limite de desvio em relação à rota | não havia | projeção mínima de avanço 0,5 |

Preservados: percepção 345 px, percepção de retorno 90 px, alcance inimigo 345 px, velocidade de projétil 380 px/s, cooldowns 1,8/3 s, três projéteis laterais de dano 10, velocidade base 120/92 px/s, bônus reto do Chaser até 30%, alvo preferido do Shooter a 190 px, margem de 3 px, regras de pausa, dano único e pontuação. Os alcances do jogador continuam 360/300 px.

## Verificação

Os cenários determinísticos usam seed 42 e passos de tempo controlados. `route-planning.spec.ts` cobre ilha circular grande, ilha alongada com caminhos de tamanhos diferentes, múltiplas ilhas, Chaser e Shooter chegando ao destino útil dentro de prazo baseado em distância e velocidade, canal de 96 px com curvas, movimento do jogador durante o contorno, dois aliados chegando à faixa de combate, saída de costa, destino cercado por terreno, recálculo periódico/distribuído, oscilação, waypoint ultrapassado e diagonais bloqueadas. O custo do A* é confrontado com Dijkstra.

A suíte naval anterior mantém cobertura do canal reto de 40 px, disparos laterais em movimento, aceleração contra zigue-zague e 30/60/120 atualizações por segundo. As regressões cobrem patrulha, retorno, geração por seed, pausa, morte, cooldowns, colisões, dano único, pontuação e limpeza.

Também foram executados testes renderizados no Chromium e inspecionadas capturas sucessivas. `route-browser.spec.ts` mostra a rota completa em torno de uma ilha grande gerada por seed, depois a passagem junto à costa e a chegada à região do jogador. Os testes navais renderizados preservam a inspeção dos arcos do Shooter.

## Limites

A optimalidade vale para os custos e conexões do grafo discretizado; não é uma prova do menor caminho contínuo possível. Uma passagem curva menor que o raio de rotação reservado pode não ter representação na grade, embora um segmento reto orientado caiba. O afastamento junto à costa tem distância máxima configurável de 640 px. Não foi feito novo benchmark com população máxima nem uma sessão prolongada em mobile. A verificação visual usou Chromium desktop com tempo controlado.
