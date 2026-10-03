import { Graphics } from 'pixi.js'
import { navigationClearance, ROUTE_MARGIN } from '../ai/PatrolNavigation'
import { leashBounds } from '../ai/EnemySystem'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import type { World } from '../world/World'

export class DebugRenderer {
  readonly graphics = new Graphics()
  render(world: World, visibleIslands: readonly boolean[]) {
      this.graphics.clear()
      world.islands.forEach((island, index) => {
        if (!visibleIslands[index]) return
        for (const collider of navigationClearance(island).slice(island.colliders.length)) {
          if (collider.type === 'polygon') this.graphics.poly(collider.vertices.flatMap(p => [p.x, p.y]))
          this.graphics.stroke({ color: 0x42e8ad, width: 2 })
        }
        for (const collider of island.colliders) {
          if (collider.type === 'polygon') {
            this.graphics.poly(collider.vertices.flatMap((p) => [p.x, p.y]))
          } else {
            this.graphics.circle(collider.position.x, collider.position.y, collider.radius)
          }
          this.graphics.stroke({ color: 0xff3d7f, width: 2 })
        }
      })
      for (const circle of world.player.alive ? world.player.colliders : []) {
        this.graphics.circle(circle.position.x, circle.position.y, circle.radius)
          .stroke({ color: 0xffff00, width: 2 })
      }
      for (const area of world.patrolAreas) {
        this.graphics.rect(area.x, area.y, area.width, area.height)
          .stroke({ color: 0x9d7bff, width: 2, alpha: 0.8 })
      }
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue
        const color = enemy.type === 'chaser' ? 0xff6947 : 0x66ddff
        this.graphics.circle(enemy.patrol.center.x, enemy.patrol.center.y, enemy.patrol.radius)
          .stroke({ color, width: 1, alpha: 0.35 })
        for (const radius of [enemy.patrol.radius - ROUTE_MARGIN, enemy.patrol.radius + ROUTE_MARGIN])
          this.graphics.circle(enemy.patrol.center.x, enemy.patrol.center.y, radius)
            .stroke({ color, width: 1, alpha: 0.2 })
        this.graphics.moveTo(enemy.position.x, enemy.position.y)
          .lineTo(enemy.position.x + Math.sin(enemy.rotation) * COMBAT_CONFIG.patrol.hullLookAhead,
            enemy.position.y - Math.cos(enemy.rotation) * COMBAT_CONFIG.patrol.hullLookAhead)
          .stroke({ color: 0xffffff, width: 2 })
        const navigation = enemy.navigation
        if (navigation.route.length) {
          this.graphics.moveTo(enemy.position.x, enemy.position.y)
          for (const point of navigation.route) this.graphics.lineTo(point.x, point.y)
          this.graphics.stroke({ color: 0x42e8ad, width: 2, alpha: 0.8 })
        }
        if (navigation.goal) this.graphics.circle(navigation.goal.x, navigation.goal.y, 8)
          .stroke({ color: navigation.routeReachable ? 0xffd166 : 0xff3d7f, width: 2 })
        if (navigation.waypoint) this.graphics.circle(navigation.waypoint.x, navigation.waypoint.y, 5)
          .stroke({ color: 0xffffff, width: 2 })
        if (navigation.escape) this.graphics.moveTo(enemy.position.x, enemy.position.y)
          .lineTo(navigation.escape.point.x, navigation.escape.point.y).stroke({ color: 0xffae42, width: 3 })
        if (enemy.navigation.waypoint) this.graphics.moveTo(enemy.position.x, enemy.position.y)
          .lineTo(enemy.navigation.waypoint.x, enemy.navigation.waypoint.y).stroke({ color: 0x42e8ad, width: 2 })
        const area = world.patrolAreas.find((item) => item.id === enemy.areaId)
        if (area) {
          const leash = leashBounds(area)
          this.graphics.rect(leash.x, leash.y, leash.width, leash.height)
            .stroke({ color, width: 2, alpha: 0.4 })
        }
        for (const circle of enemy.colliders) {
          this.graphics.circle(circle.position.x, circle.position.y, circle.radius)
            .stroke({ color, width: 2 })
        }
        this.graphics.circle(enemy.position.x, enemy.position.y, enemy.visionRange)
          .stroke({ color, width: 1, alpha: 0.5 })
        if (enemy.type === 'shooter') {
          this.graphics.circle(enemy.position.x, enemy.position.y, enemy.attackRange)
            .stroke({ color: 0xffd166, width: 1, alpha: 0.7 })
        }
      }
      for (const projectile of world.projectiles) {
        const circle = projectile.collider
        this.graphics.circle(circle.position.x, circle.position.y, circle.radius)
          .stroke({ color: projectile.team === 'player' ? 0xffffff : 0xff4444, width: 1 })
      }
  }
}
