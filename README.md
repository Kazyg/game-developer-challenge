# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```


## Controles e mobile

Desktop: W avança, A/D giram, Space dispara à frente, Q/E disparam as laterais,
R inicia Repair, Escape abre Pause e U alterna o debug. Os ícones na HUD indicam
as teclas. Os mesmos botões também funcionam com mouse e touch:
movimento e disparos aceitam ponteiros simultâneos e exibem pressão/cooldown.
Cancelamento do ponteiro, perda de foco e pause limpam os comandos ativos.
Pause e `?` estão disponíveis sem teclado; fechar as instruções exige Resume.

Gameplay mobile é recomendado em **landscape**. Portrait permanece funcional e
mostra uma orientação para girar o dispositivo. A HUD considera safe areas.

## Simulação, spawn e resultado

A renderização limita navios, projéteis, efeitos e ilhas à câmera, com margem
para evitar cortes nas bordas; o oceano cobre apenas a tela. A simulação mantém
todos os inimigos ativos. Colisões descartam objetos distantes antes de testar
os cascos e polígonos; os cascos são reutilizados enquanto a posição e rotação
não mudam. As barras de vida redesenham suas máscaras apenas quando o HP muda.

A simulação usa passos de 1/60s, com até 12 passos por frame. O tempo excedente
fica acumulado para os frames seguintes; pause não acrescenta tempo ativo.
A partida inicia com um Chaser e um Shooter em cada uma das 24 Patrol Areas,
com limite global de 48 inimigos ativos. `Enemy Spawn Time` define o intervalo
para repor cada inimigo morto na mesma área e com o mesmo tipo.
Mortes simultâneas permitem reposições simultâneas. Posições bloqueadas são
checadas novamente após 2s, respeitando o jogador, as ilhas e os demais navios.

`pirate-battle-lastCompletedMatch-v1` guarda a última partida concluída,
independentemente da fila de registros: score, tempo, motivo, seed, configuração,
identidade/ID do registro, status e erro. Pending/Failed permitem Retry com o mesmo
ID; Saved permanece após refresh. Refresh durante gameplay não conclui a partida.
Storage bloqueado usa defaults/memória e não impede a inicialização.

A arena tem 30–42 ilhas com contornos compartilhados entre arte e colisão,
incluindo baías e penínsulas. As categorias SMALL (200–260), MEDIUM (300–365),
LARGE (470–590) e HUGE (680–860) geram contornos próprios, com maior complexidade
costeira nas maiores ilhas. Grandes são menos comuns e enormes são raras.
Fortes, complexos secundários e naufrágios usam a área útil e a geometria local;
cantos e conexões dos tiles foram verificados visualmente. Água rasa e
decoração são somente visuais. Navios usam escala 0.6 e sprites completos
conforme HP; os cascos mortos afundam por 3 segundos. As bandeiras mantêm a
identidade original. Canhões e tripulantes continuam sendo efeitos visuais.
Os assets originais foram inspecionados; detalhes e decisões estão em [POLISH.md](POLISH.md).

A rodada seguinte de ajustes está documentada em [ADJUSTMENTS.md](ADJUSTMENTS.md): ilhas de tamanho 200–460, decoração costeira/interior, 24 Patrol Areas e comandos interativos também com mouse, incluindo feedback de cooldown.

A geração atual mantém corredores de mar entre as ilhas e valida água navegável
conectada ao spawn. Patrol Areas ocupadas por terra são reposicionadas ou reduzidas.
Perfis, composições e critérios estão em [IslandStructures.md](src/game/world/IslandStructures.md).
