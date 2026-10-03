import { GAME_CONFIG } from '../config/GameConfig'
export const ENEMY_HULL_RADIUS = Math.max(...GAME_CONFIG.playerHullCircles.map(circle =>
  (Math.hypot(circle.x, circle.y) + circle.radius) * GAME_CONFIG.enemySpriteScale))
