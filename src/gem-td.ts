import Phaser from 'phaser'
import './games.scss'
import { CHANCE_COSTS, CHANCE_TABLE, GEM_ROLES, GEM_STATS, WAVE_DEFINITIONS } from './gem-td/content'
import { BOARD_COLS, BOARD_ROWS, calculateRoute, ROUTE_ANCHORS } from './gem-td/pathfinding'
import { SeededRandom } from './gem-td/random'
import {
  beginNextPlacement,
  buyGemChance,
  canCraftPrism,
  canCraftSlate,
  completeWave,
  createInitialState,
  craftPrism,
  craftSlate,
  keepCandidate,
  loseLife,
  moveCandidate,
  moveSlate,
  placeCandidate,
} from './gem-td/rules'
import type { Cell, GameState, Gem } from './gem-td/types'

const GAME_WIDTH = 960
const GAME_HEIGHT = 540
const CELL_SIZE = 24
const VIEW_X = 20
const VIEW_Y = 58
const VIEW_WIDTH = 680
const VIEW_HEIGHT = 442
const PANEL_X = 720
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2

type RuntimeEnemy = {
  distance: number
  health: number
  maxHealth: number
  speed: number
  armor: number
  slowUntil: number
  aura: Phaser.GameObjects.Arc
  body: Phaser.GameObjects.Arc
  healthBack: Phaser.GameObjects.Rectangle
  healthBar: Phaser.GameObjects.Rectangle
  indicator: Phaser.GameObjects.Triangle
}

class GemTdScene extends Phaser.Scene {
  private state: GameState = createInitialState()
  private readonly seed = this.readSeed()
  private random = new SeededRandom(this.seed)
  private boardObjects: Phaser.GameObjects.GameObject[] = []
  private enemies: RuntimeEnemy[] = []
  private route: readonly Cell[] = []
  private selectedGemId?: number
  private statusText?: Phaser.GameObjects.Text
  private waveText?: Phaser.GameObjects.Text
  private resourceText?: Phaser.GameObjects.Text
  private panelTitle?: Phaser.GameObjects.Text
  private panelBody?: Phaser.GameObjects.Text
  private actionObjects: Phaser.GameObjects.GameObject[] = []
  private towerCooldowns = new Map<number, number>()
  private slateCooldowns = new Map<number, number>()
  private waveBounty = 0
  private waveTime = 0
  private cursor: Cell = { col: 5, row: 0 }
  private paused = false
  private speed = 1
  private movingSlateId?: number
  private movingCandidateId?: number
  private boardLayer?: Phaser.GameObjects.Container
  private enemyLayer?: Phaser.GameObjects.Container
  private indicatorLayer?: Phaser.GameObjects.Container
  private zoom = Math.min(VIEW_WIDTH / (BOARD_COLS * CELL_SIZE), VIEW_HEIGHT / (BOARD_ROWS * CELL_SIZE)) * 0.96
  private panX = 0
  private panY = 0
  private drag?: { x: number; y: number; panX: number; panY: number; moved: boolean }
  private pinch?: { distance: number; zoom: number; worldX: number; worldY: number }

  constructor() {
    super('GemTd')
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x171716)
    this.boardLayer = this.add.container()
    this.enemyLayer = this.add.container()
    this.indicatorLayer = this.add.container()
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false)
    maskShape.fillRect(VIEW_X, VIEW_Y, VIEW_WIDTH, VIEW_HEIGHT)
    const boardMask = maskShape.createGeometryMask()
    this.boardLayer.setMask(boardMask)
    this.enemyLayer.setMask(boardMask)

    this.waveText = this.add.text(VIEW_X, 22, '', this.hudStyle())
    this.resourceText = this.add.text(VIEW_X + VIEW_WIDTH, 22, '', this.hudStyle()).setOrigin(1, 0)
    this.statusText = this.add
      .text(VIEW_X + VIEW_WIDTH / 2, 526, '', this.hudStyle())
      .setOrigin(0.5, 1)

    this.add.rectangle(PANEL_X, VIEW_Y, 220, VIEW_HEIGHT, 0x20201f).setOrigin(0, 0).setStrokeStyle(1, 0x4b4b46)
    this.panelTitle = this.add.text(PANEL_X + 20, VIEW_Y + 20, '', {
      color: '#f5c44d',
      fontFamily: 'Archivo Black, sans-serif',
      fontSize: '20px',
    })
    this.panelBody = this.add.text(PANEL_X + 20, VIEW_Y + 62, '', {
      color: '#aaa49b',
      fontFamily: 'DM Sans, sans-serif',
      fontSize: '15px',
      lineSpacing: 7,
      wordWrap: { width: 188 },
    })
    this.addZoomControl(PANEL_X + 22, 20, '−', () => this.zoomAt(VIEW_X + VIEW_WIDTH / 2, VIEW_Y + VIEW_HEIGHT / 2, 0.8))
    this.addZoomControl(PANEL_X + 78, 20, '⌂', () => this.resetView())
    this.addZoomControl(PANEL_X + 134, 20, '+', () => this.zoomAt(VIEW_X + VIEW_WIDTH / 2, VIEW_Y + VIEW_HEIGHT / 2, 1.25))
    this.addZoomControl(PANEL_X + 190, 20, '⛶', () => this.toggleFullscreen())

    this.input.keyboard?.on('keydown', this.handleKey)
    this.input.addPointer(1)
    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handlePointerMove)
    this.input.on('pointerup', this.handlePointerUp)
    this.input.on('wheel', this.handleWheel)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKey)
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handlePointerMove)
      this.input.off('pointerup', this.handlePointerUp)
      this.input.off('wheel', this.handleWheel)
    })

    this.clampView()
    this.game.canvas.style.touchAction = 'none'
    this.render()
  }

  update(_time: number, delta: number): void {
    if (this.state.phase !== 'wave' || this.state.outcome || this.paused) return
    const deltaSeconds = Math.min(delta / 1000, 0.05) * this.speed
    this.waveTime += deltaSeconds
    this.updateEnemies(deltaSeconds)
    this.updateTowers(deltaSeconds)
    this.updateSlates(deltaSeconds)

    if (this.enemies.length === 0 && this.state.phase === 'wave') this.finishWave()
  }

  private render(): void {
    this.renderBoard()
    this.actionObjects.forEach((object) => object.destroy())
    this.actionObjects = []
    this.renderPanel()
    this.updateHud()
  }

  private renderBoard(): void {
    this.boardObjects.forEach((object) => object.destroy())
    this.boardObjects = []

    this.renderGrid()
    this.renderRoute()
    this.renderPieces()
    this.boardLayer?.add(this.boardObjects)
    this.enemies.forEach((enemy) => this.positionEnemy(enemy))
  }

  private renderGrid(): void {
    const topLeft = this.worldToScreen(0, 0)
    const width = BOARD_COLS * CELL_SIZE * this.zoom
    const height = BOARD_ROWS * CELL_SIZE * this.zoom
    const background = this.add.rectangle(topLeft.x, topLeft.y, width, height, 0x20201f).setOrigin(0)
    const grid = this.add.graphics().lineStyle(1, 0x4b4b46, this.zoom < 0.45 ? 0.35 : 0.72)
    const firstCol = Math.max(0, Math.floor(this.panX / CELL_SIZE))
    const lastCol = Math.min(BOARD_COLS, Math.ceil((this.panX + VIEW_WIDTH / this.zoom) / CELL_SIZE))
    const firstRow = Math.max(0, Math.floor(this.panY / CELL_SIZE))
    const lastRow = Math.min(BOARD_ROWS, Math.ceil((this.panY + VIEW_HEIGHT / this.zoom) / CELL_SIZE))

    for (let col = firstCol; col <= lastCol; col += 1) {
      const x = this.worldToScreen(col * CELL_SIZE, 0).x
      grid.lineBetween(x, VIEW_Y, x, VIEW_Y + VIEW_HEIGHT)
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = this.worldToScreen(0, row * CELL_SIZE).y
      grid.lineBetween(VIEW_X, y, VIEW_X + VIEW_WIDTH, y)
    }

    this.boardObjects.push(background, grid)
    if (this.state.phase === 'placing' || this.state.phase === 'choosing') {
      const point = this.cellCenter(this.cursor)
      const cursor = this.add.rectangle(
        point.x,
        point.y,
        CELL_SIZE * this.zoom,
        CELL_SIZE * this.zoom,
        0xf5c44d,
        0.08,
      ).setStrokeStyle(Math.max(1, 2 * this.zoom), 0xf5c44d)
      this.boardObjects.push(cursor)
    }
  }

  private renderRoute(): void {
    const obstacles = [...this.state.candidates, ...this.state.towers, ...this.state.rocks]
    this.route = calculateRoute(obstacles) ?? []
    if (this.route.length > 1) {
      const graphics = this.add.graphics().lineStyle(Math.max(2, 8 * this.zoom), 0xcdb86e, 0.32)
      graphics.beginPath()
      const first = this.cellCenter(this.route[0])
      graphics.moveTo(first.x, first.y)
      this.route.slice(1).forEach((cell) => {
        const point = this.cellCenter(cell)
        graphics.lineTo(point.x, point.y)
      })
      graphics.strokePath()
      this.boardObjects.push(graphics)
    }

    const waypointGroups = new Map<string, { anchor: Cell; numbers: number[] }>()
    ROUTE_ANCHORS.slice(1, -1).forEach((anchor, index) => {
      const key = `${anchor.col},${anchor.row}`
      const group = waypointGroups.get(key) ?? { anchor, numbers: [] }
      group.numbers.push(index + 1)
      waypointGroups.set(key, group)
    })
    waypointGroups.forEach(({ anchor, numbers }) => {
      const point = this.cellCenter(anchor)
      const markerSize = Math.max(5, 8 * this.zoom)
      const marker = this.add.rectangle(point.x, point.y, markerSize, markerSize, 0xf5c44d).setAngle(45)
      const label = this.add.text(
        point.x,
        point.y - Math.max(10, 13 * this.zoom),
        numbers.join(' / '),
        {
        ...this.hudStyle(),
        color: '#f5c44d',
        backgroundColor: '#171716',
        fontSize: `${Math.max(9, 11 * this.zoom)}px`,
        padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1)
      this.boardObjects.push(marker, label)
    })
    const start = this.cellCenter(ROUTE_ANCHORS[0])
    const end = this.cellCenter(ROUTE_ANCHORS[ROUTE_ANCHORS.length - 1])
    this.boardObjects.push(
      this.add.text(start.x + 8, start.y - 14, 'START', { ...this.hudStyle(), fontSize: '9px' }),
      this.add.text(end.x - 8, end.y - 14, 'END', { ...this.hudStyle(), fontSize: '9px' }).setOrigin(1, 0),
    )
  }

  private renderPieces(): void {
    this.state.rocks.forEach((rock) => {
      const point = this.cellCenter(rock)
      const size = CELL_SIZE * this.zoom * 0.76
      const body = this.add.rectangle(point.x, point.y, size, size, 0x454641)
        .setStrokeStyle(Math.max(1, this.zoom), 0x77776f).setAngle(5)
      this.boardObjects.push(body)
    })

    this.state.towers.forEach((gem) => this.renderGem(gem, false))
    this.state.candidates.forEach((gem) => this.renderGem(gem, true))
    this.state.slates.forEach((slate) => {
      const point = this.cellCenter(slate)
      const selected = this.movingSlateId === slate.id
      const body = this.add
        .rectangle(point.x, point.y, CELL_SIZE * this.zoom * 0.7, CELL_SIZE * this.zoom * 0.7, 0x8d6aa8, 0.78)
        .setStrokeStyle(selected ? 3 : 2, selected ? 0xf4efe6 : 0xd6aee8)
        .setAngle(45)
      const mark = this.add.text(point.x, point.y, '+', {
        ...this.hudStyle(),
        color: '#f4efe6',
        fontSize: '18px',
      }).setOrigin(0.5)
      this.boardObjects.push(body, mark)
    })
  }

  private renderGem(gem: Gem, candidate: boolean): void {
    const point = this.cellCenter(gem)
    const stats = GEM_STATS[gem.kind][gem.quality]
    const selected = this.selectedGemId === gem.id
    const radius = Math.max(3, CELL_SIZE * this.zoom * 0.34)
    const shadow = this.add.circle(point.x, point.y, selected ? radius * 1.3 : radius, stats.color, selected ? 0.24 : 0.12)
    const body = this.add.polygon(
      point.x,
      point.y,
      [0, -radius, radius * 0.84, -radius * 0.44, radius * 0.67, radius * 0.72, 0, radius, -radius * 0.67, radius * 0.72, -radius * 0.84, -radius * 0.44],
      stats.color,
      candidate ? 0.92 : 1,
    ).setStrokeStyle(selected ? 3 : 1, selected ? 0xf4efe6 : 0x171716)
    const quality = this.add.text(point.x, point.y + radius + 2, gem.quality[0].toUpperCase(), {
      ...this.hudStyle(),
      fontSize: `${Math.max(6, 9 * this.zoom)}px`,
    }).setOrigin(0.5, 0)
    this.boardObjects.push(shadow, body, quality)
  }

  private renderPanel(): void {
    const nextWave = this.state.wave + 1
    if (this.state.phase === 'placing') {
      const selected = this.state.candidates.find((gem) => gem.id === this.selectedGemId)
      const stats = selected ? GEM_STATS[selected.kind][selected.quality] : undefined
      this.panelTitle?.setText(this.movingCandidateId ? 'MOVE GEM' : selected ? 'CURRENT GEM' : 'PLACE FIVE')
      this.panelBody?.setText(this.movingCandidateId
        ? 'Tap an open cell to relocate this gem. Its type and quality will not change.'
        : selected && stats
          ? `${stats.label}\n${selected.quality.toUpperCase()} QUALITY\n\n${GEM_ROLES[selected.kind]}\nDamage ${stats.damage}  Range ${stats.range}\n\nCurrent-round gems can be moved without changing their roll.`
          : `Tap open cells to reveal random gems.\n\nPlaced  ${this.state.candidates.length} / 5\n\nKeep the route open through all six markers.\n\nDrag to pan. Pinch or scroll to zoom.`)
      if (selected) {
        this.addAction(this.movingCandidateId ? 'CANCEL MOVE' : 'MOVE GEM', 376, () => this.toggleCandidateMove(selected.id))
      }
      return
    }

    if (this.state.phase === 'choosing') {
      const selected = this.state.candidates.find((gem) => gem.id === this.selectedGemId)
      const stats = selected ? GEM_STATS[selected.kind][selected.quality] : undefined
      this.panelTitle?.setText('KEEP ONE')
      this.panelBody?.setText(selected && stats
        ? `${stats.label}\n${selected.quality.toUpperCase()} QUALITY\n\n${GEM_ROLES[selected.kind]}\nDamage ${stats.damage}  Range ${stats.range}\n\nThe other four become permanent rocks.`
        : 'Tap a gem to inspect it, then confirm your keeper. The other four become permanent rocks.')
      if (selected) this.addAction('KEEP THIS GEM', 376, () => this.confirmKeeper(selected.id))
      if (selected) this.addAction(this.movingCandidateId ? 'CANCEL MOVE' : 'MOVE GEM', 434, () => this.toggleCandidateMove(selected.id))
      return
    }

    if (this.state.phase === 'wave') {
      const definition = WAVE_DEFINITIONS[this.state.wave]
      this.panelTitle?.setText(`WAVE ${nextWave}`)
      this.panelBody?.setText(
        `${this.paused ? 'PAUSED\n' : ''}${definition.count === 1 ? 'Leader' : `${definition.count} enemies`}\nHealth  ${definition.health}\nSpeed  ${definition.speed.toFixed(2)}\nArmor  ${definition.armor}\n\nWave bounty  ${this.waveBounty}`,
      )
      this.addAction(this.paused ? 'RESUME  [P]' : 'PAUSE  [P]', 354, () => this.togglePause())
      this.addAction(`SPEED ${this.speed}X  [F]`, 412, () => this.toggleSpeed())
      return
    }

    if (this.state.phase === 'reward') {
      const odds = CHANCE_TABLE[this.state.chanceLevel]
      const cost = CHANCE_COSTS[this.state.chanceLevel]
      this.panelTitle?.setText('WAVE CLEAR')
      this.panelBody?.setText(
        `Chance ${this.state.chanceLevel + 1}: ${odds[0]} / ${odds[1]} / ${odds[2]}%\nUpgrade cost  ${cost ?? 'MAX'}\n\nRECIPES\nEmber + Tide = Prism\nVolt + Moss = Slate${this.movingSlateId ? '\n\nTap a destination.' : ''}`,
      )
      if (canCraftPrism(this.state)) this.addAction('COMBINE PRISM', 290, () => this.combinePrism())
      if (canCraftSlate(this.state)) this.addAction('CRAFT SLATE', 338, () => this.combineSlate())
      if (cost !== undefined) this.addAction('UPGRADE CHANCE', 386, () => this.upgradeChance())
      this.addAction('NEXT BUILD', 434, () => this.nextBuild())
      return
    }

    this.panelTitle?.setText(this.state.outcome === 'victory' ? 'MAZE HOLDS' : 'RUN ENDED')
    this.panelBody?.setText(
      this.state.outcome === 'victory'
        ? `Five waves cleared.\n\nBounty banked  ${this.state.bounty}\nTowers kept  ${this.state.towers.length}`
        : `The invaders escaped.\n\nReached wave ${nextWave}.`,
    )
    this.addAction('PLAY AGAIN', 390, () => this.restart())
  }

  private addAction(label: string, y: number, handler: () => void): void {
    const button = this.add
      .text(730, y, label, {
        color: '#171716',
        backgroundColor: '#f5c44d',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        align: 'center',
        fixedWidth: 184,
        padding: { top: 12, bottom: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', handler)
    this.actionObjects.push(button)
  }

  private addZoomControl(x: number, y: number, label: string, handler: () => void): void {
    this.add.text(x, y, label, {
      color: '#f4efe6',
      backgroundColor: '#343430',
      fontFamily: 'DM Sans, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      align: 'center',
      fixedWidth: 42,
      fixedHeight: 30,
    }).setInteractive({ useHandCursor: true }).on('pointerdown', handler)
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    const pointers = this.downPointers()
    if (pointers.length >= 2) {
      this.startPinch(pointers[0], pointers[1])
      this.drag = undefined
      return
    }
    if (!this.isInView(pointer.x, pointer.y)) return
    this.drag = { x: pointer.x, y: pointer.y, panX: this.panX, panY: this.panY, moved: false }
  }

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    const pointers = this.downPointers()
    if (pointers.length >= 2) {
      const [first, second] = pointers
      if (!this.pinch) this.startPinch(first, second)
      if (!this.pinch) return
      const distance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y)
      const midpointX = (first.x + second.x) / 2
      const midpointY = (first.y + second.y) / 2
      this.zoom = Phaser.Math.Clamp(this.pinch.zoom * distance / this.pinch.distance, MIN_ZOOM, MAX_ZOOM)
      this.panX = this.pinch.worldX - (midpointX - VIEW_X) / this.zoom
      this.panY = this.pinch.worldY - (midpointY - VIEW_Y) / this.zoom
      this.clampView()
      this.renderBoard()
      return
    }
    if (!this.drag || !pointer.isDown) return
    const deltaX = pointer.x - this.drag.x
    const deltaY = pointer.y - this.drag.y
    if (Math.hypot(deltaX, deltaY) > 5) this.drag.moved = true
    if (!this.drag.moved) return
    this.panX = this.drag.panX - deltaX / this.zoom
    this.panY = this.drag.panY - deltaY / this.zoom
    this.clampView()
    this.renderBoard()
  }

  private handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.pinch) {
      if (this.downPointers().length < 2) this.pinch = undefined
      this.drag = undefined
      return
    }
    const drag = this.drag
    this.drag = undefined
    if (!drag || drag.moved || !this.isInView(pointer.x, pointer.y)) return
    const cell = this.screenToCell(pointer.x, pointer.y)
    if (!cell) return
    this.cursor = cell
    this.handleCell(cell)
  }

  private handleWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (!this.isInView(pointer.x, pointer.y)) return
    this.zoomAt(pointer.x, pointer.y, deltaY > 0 ? 0.86 : 1.16)
  }

  private downPointers(): Phaser.Input.Pointer[] {
    return [this.input.mousePointer, this.input.pointer1, this.input.pointer2]
      .filter((pointer, index, pointers) => pointer?.isDown && pointers.indexOf(pointer) === index)
  }

  private startPinch(first: Phaser.Input.Pointer, second: Phaser.Input.Pointer): void {
    const midpointX = (first.x + second.x) / 2
    const midpointY = (first.y + second.y) / 2
    const world = this.screenToWorld(midpointX, midpointY)
    this.pinch = {
      distance: Math.max(1, Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y)),
      zoom: this.zoom,
      worldX: world.x,
      worldY: world.y,
    }
  }

  private zoomAt(screenX: number, screenY: number, factor: number): void {
    const world = this.screenToWorld(screenX, screenY)
    this.zoom = Phaser.Math.Clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    this.panX = world.x - (screenX - VIEW_X) / this.zoom
    this.panY = world.y - (screenY - VIEW_Y) / this.zoom
    this.clampView()
    this.renderBoard()
  }

  private resetView(): void {
    this.zoom = Math.min(VIEW_WIDTH / (BOARD_COLS * CELL_SIZE), VIEW_HEIGHT / (BOARD_ROWS * CELL_SIZE)) * 0.96
    this.panX = 0
    this.panY = 0
    this.clampView()
    this.renderBoard()
  }

  private clampView(): void {
    const maxPanX = BOARD_COLS * CELL_SIZE - VIEW_WIDTH / this.zoom
    const maxPanY = BOARD_ROWS * CELL_SIZE - VIEW_HEIGHT / this.zoom
    this.panX = maxPanX < 0 ? maxPanX / 2 : Phaser.Math.Clamp(this.panX, 0, maxPanX)
    this.panY = maxPanY < 0 ? maxPanY / 2 : Phaser.Math.Clamp(this.panY, 0, maxPanY)
  }

  private isInView(x: number, y: number): boolean {
    return x >= VIEW_X && x <= VIEW_X + VIEW_WIDTH && y >= VIEW_Y && y <= VIEW_Y + VIEW_HEIGHT
  }

  private screenToWorld(x: number, y: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.panX + (x - VIEW_X) / this.zoom,
      this.panY + (y - VIEW_Y) / this.zoom,
    )
  }

  private screenToCell(x: number, y: number): Cell | null {
    const world = this.screenToWorld(x, y)
    const col = Math.floor(world.x / CELL_SIZE)
    const row = Math.floor(world.y / CELL_SIZE)
    return col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS ? { col, row } : null
  }

  private handleCell(cell: Cell): void {
    if (this.movingCandidateId && (this.state.phase === 'placing' || this.state.phase === 'choosing')) {
      const moved = moveCandidate(this.state, this.movingCandidateId, cell)
      if (moved === this.state) {
        this.showStatus('That gem cannot move there.', '#e9573f')
      } else {
        this.state = moved
        this.movingCandidateId = undefined
        this.showStatus('Current gem moved.', '#f5c44d')
        this.render()
      }
      return
    }

    const candidate = this.state.candidates.find((gem) => gem.col === cell.col && gem.row === cell.row)
    if (candidate && (this.state.phase === 'placing' || this.state.phase === 'choosing')) {
      this.selectedGemId = candidate.id
      this.showStatus(`${GEM_STATS[candidate.kind][candidate.quality].label} selected. Current-round gem.`, '#f5c44d')
      this.render()
      return
    }

    const tower = this.state.towers.find((gem) => gem.col === cell.col && gem.row === cell.row)
    if (tower) {
      this.selectedGemId = tower.id
      this.showStatus(`${GEM_STATS[tower.kind][tower.quality].label} selected. Locked from an earlier round.`, '#aaa49b')
      this.renderBoard()
      return
    }

    if (this.state.rocks.some((rock) => rock.col === cell.col && rock.row === cell.row)) {
      this.selectedGemId = undefined
      this.showStatus('Rock selected. Old rocks are locked.', '#aaa49b')
      this.renderBoard()
      return
    }

    const waypointIndexes = ROUTE_ANCHORS
      .map((anchor, index) => ({ anchor, index }))
      .filter(({ anchor }) => anchor.col === cell.col && anchor.row === cell.row)
      .map(({ index }) => index)
    if (waypointIndexes.length > 0) {
      this.selectedGemId = undefined
      const label = waypointIndexes[0] === 0
        ? 'Start'
        : waypointIndexes[0] === ROUTE_ANCHORS.length - 1
          ? 'End'
          : `${waypointIndexes.length > 1 ? 'Waypoints' : 'Waypoint'} ${waypointIndexes.join(' / ')}`
      this.showStatus(`${label} selected. Route corners cannot be changed.`, '#f5c44d')
      this.renderBoard()
      return
    }

    if (this.state.phase === 'placing') {
      const result = placeCandidate(this.state, cell, this.random)
      if (result.error) {
        const messages = {
          'wrong-phase': 'Finish the current choice first.',
          occupied: 'That cell is already occupied.',
          waypoint: 'Waypoints must stay open.',
          'blocked-route': 'That placement seals the route.',
        }
        this.showStatus(messages[result.error], '#e9573f')
        return
      }
      this.state = result.state
      this.selectedGemId = result.gem?.id
      if (result.gem) this.showStatus(`${GEM_STATS[result.gem.kind][result.gem.quality].label} revealed`, '#f5c44d')
      this.render()
      return
    }

    if (this.state.phase === 'choosing') {
      this.showStatus('Select one of the five current gems.', '#aaa49b')
      return
    }


    if (this.state.phase === 'reward') {
      const slate = this.state.slates.find((candidate) => candidate.col === cell.col && candidate.row === cell.row)
      if (slate) {
        this.movingSlateId = slate.id
        this.showStatus('Slate selected. Tap an open destination.', '#d6aee8')
        this.render()
      } else if (this.movingSlateId) {
        const moved = moveSlate(this.state, this.movingSlateId, cell)
        if (moved === this.state) {
          this.showStatus('The slate cannot move there.', '#e9573f')
        } else {
          this.state = moved
          this.movingSlateId = undefined
          this.showStatus('Slate repositioned.', '#d6aee8')
          this.render()
        }
      }
    }
  }

  private handleKey = (event: KeyboardEvent): void => {
    const directions: Record<string, Cell> = {
      ArrowLeft: { col: -1, row: 0 },
      ArrowRight: { col: 1, row: 0 },
      ArrowUp: { col: 0, row: -1 },
      ArrowDown: { col: 0, row: 1 },
    }
    const direction = directions[event.key]
    if (direction && (this.state.phase === 'placing' || this.state.phase === 'choosing')) {
      event.preventDefault()
      this.cursor = {
        col: (this.cursor.col + direction.col + BOARD_COLS) % BOARD_COLS,
        row: (this.cursor.row + direction.row + BOARD_ROWS) % BOARD_ROWS,
      }
      this.render()
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && (this.state.phase === 'placing' || this.state.phase === 'choosing')) {
      event.preventDefault()
      this.handleCell(this.cursor)
      return
    }
    if (event.key.toLowerCase() === 'k' && this.state.phase === 'choosing' && this.selectedGemId) {
      this.confirmKeeper(this.selectedGemId)
    } else if (event.key.toLowerCase() === 'p' && this.state.phase === 'wave') {
      this.togglePause()
    } else if (event.key.toLowerCase() === 'f' && this.state.phase === 'wave') {
      this.toggleSpeed()
    } else if (event.key.toLowerCase() === 'u' && this.state.phase === 'reward') {
      this.upgradeChance()
    } else if (event.key.toLowerCase() === 'n' && this.state.phase === 'reward') {
      this.nextBuild()
    } else if (event.key.toLowerCase() === 'r' && this.state.phase === 'ended') {
      this.restart()
    }
  }

  private confirmKeeper(gemId: number): void {
    this.state = keepCandidate(this.state, gemId)
    this.selectedGemId = undefined
    this.startWave()
  }

  private toggleCandidateMove(gemId: number): void {
    this.movingCandidateId = this.movingCandidateId === gemId ? undefined : gemId
    this.render()
    this.showStatus(this.movingCandidateId ? 'Tap an open destination.' : 'Move canceled.', '#f4efe6')
  }

  private toggleFullscreen(): void {
    if (!this.sys.game.device.fullscreen.available) {
      this.showStatus('Fullscreen is not supported by this browser.', '#e9573f')
      return
    }
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen()
    } else {
      this.scale.startFullscreen()
    }
  }

  private startWave(): void {
    this.paused = false
    this.render()
    this.route = calculateRoute([...this.state.towers, ...this.state.rocks]) ?? []
    const definition = WAVE_DEFINITIONS[this.state.wave]
    this.waveBounty = 0
    this.waveTime = 0
    this.towerCooldowns.clear()
    this.slateCooldowns.clear()
    this.enemies = Array.from({ length: definition.count }, (_, index) => {
      const point = this.cellCenter(this.route[0])
      const aura = this.add.circle(point.x, point.y, definition.count === 1 ? 14 : 10, 0x050505, 0.88)
        .setStrokeStyle(2, 0xf4efe6, 0.95)
        .setAlpha(0)
      const body = this.add.circle(point.x, point.y, definition.count === 1 ? 9 : 6, 0x46d7ff)
        .setStrokeStyle(1, 0x09212a)
        .setAlpha(0)
      const healthBack = this.add.rectangle(point.x, point.y - 14, 24, 4, 0x171716)
        .setOrigin(0, 0.5)
        .setAlpha(0)
      const healthBar = this.add.rectangle(point.x, point.y - 14, 20, 2, 0x82b96b)
        .setOrigin(0, 0.5)
        .setAlpha(0)
      const indicator = this.add.triangle(point.x, point.y, 0, -7, 6, 5, -6, 5, 0x46d7ff)
        .setStrokeStyle(1, 0xf4efe6, 0.95)
        .setAlpha(0)
      this.enemyLayer?.add([aura, body, healthBack, healthBar])
      this.indicatorLayer?.add(indicator)
      return {
        distance: -index * 1.15,
        health: definition.health,
        maxHealth: definition.health,
        speed: definition.speed,
        armor: definition.armor,
        slowUntil: 0,
        aura,
        body,
        healthBack,
        healthBar,
        indicator,
      }
    })
  }

  private updateEnemies(delta: number): void {
    for (const enemy of [...this.enemies]) {
      const speedMultiplier = this.waveTime < enemy.slowUntil ? 0.62 : 1
      enemy.distance += enemy.speed * speedMultiplier * delta
      if (enemy.distance < 0) continue
      enemy.body.setAlpha(1)
      enemy.aura.setAlpha(1)
      enemy.healthBack.setAlpha(1)
      enemy.healthBar.setAlpha(1)

      if (enemy.distance >= this.route.length - 1) {
        this.removeEnemy(enemy)
        this.state = loseLife(this.state)
        this.showStatus('LEAK! One life lost.', '#e9573f')
        this.updateHud()
        if (this.state.phase === 'ended') {
          this.enemies.forEach((remaining) => this.destroyEnemy(remaining))
          this.enemies = []
          this.render()
          this.showStatus('Run ended. The invaders broke through.', '#e9573f')
          return
        }
        continue
      }

      const routeIndex = Math.floor(enemy.distance)
      if (routeIndex < this.route.length - 1) this.positionEnemy(enemy)
    }
  }

  private updateTowers(delta: number): void {
    for (const gem of this.state.towers) {
      const supported = gem.kind !== 'moss' && this.state.towers.some((tower) =>
        tower.kind === 'moss' && Phaser.Math.Distance.Between(gem.col, gem.row, tower.col, tower.row) <= 2.5)
      const cooldown = Math.max(0, (this.towerCooldowns.get(gem.id) ?? 0) - delta * (supported ? 1.25 : 1))
      this.towerCooldowns.set(gem.id, cooldown)
      if (cooldown > 0) continue

      const stats = GEM_STATS[gem.kind][gem.quality]
      const origin = this.cellCenter(gem)
      const targets = this.enemies
        .filter((enemy) => enemy.distance >= 0 && Phaser.Math.Distance.Between(
          origin.x,
          origin.y,
          enemy.body.x,
          enemy.body.y,
        ) <= stats.range * CELL_SIZE * this.zoom)
        .sort((first, second) => second.distance - first.distance)
      const target = targets[0]
      if (!target) continue

      this.towerCooldowns.set(gem.id, stats.cooldown)
      this.hitEnemy(target, Math.max(1, stats.damage - target.armor), stats.color, origin)
      if (gem.kind === 'tide') target.slowUntil = this.waveTime + 1.2
      if (gem.kind === 'volt' && targets[1]) {
        this.hitEnemy(targets[1], Math.max(1, stats.damage * 0.55 - targets[1].armor), stats.color, origin)
      }
    }
  }

  private updateSlates(delta: number): void {
    for (const slate of this.state.slates) {
      const cooldown = Math.max(0, (this.slateCooldowns.get(slate.id) ?? 0) - delta)
      this.slateCooldowns.set(slate.id, cooldown)
      if (cooldown > 0) continue
      const origin = this.cellCenter(slate)
      const targets = this.enemies.filter((enemy) => enemy.distance >= 0 && Phaser.Math.Distance.Between(
        origin.x,
        origin.y,
        enemy.body.x,
        enemy.body.y,
      ) <= CELL_SIZE * this.zoom * 0.82)
      if (targets.length === 0) continue
      this.slateCooldowns.set(slate.id, 1.25)
      targets.forEach((enemy) => this.hitEnemy(enemy, Math.max(1, 10 - enemy.armor), 0xd6aee8, origin))
      const pulse = this.add.circle(origin.x, origin.y, 8, 0xd6aee8, 0).setStrokeStyle(3, 0xd6aee8, 0.8)
      this.boardLayer?.add(pulse)
      this.tweens.add({ targets: pulse, scale: 5, alpha: 0, duration: 260, onComplete: () => pulse.destroy() })
    }
  }

  private hitEnemy(enemy: RuntimeEnemy, damage: number, color: number, origin: Phaser.Math.Vector2): void {
    const beam = this.add.line(0, 0, origin.x, origin.y, enemy.body.x, enemy.body.y, color, 0.65).setOrigin(0).setDepth(4)
    this.boardLayer?.add(beam)
    this.tweens.add({ targets: beam, alpha: 0, duration: 110, onComplete: () => beam.destroy() })
    enemy.health -= damage
    if (enemy.health > 0) return

    this.waveBounty += WAVE_DEFINITIONS[this.state.wave].reward
    this.removeEnemy(enemy)
    this.showStatus(`+${WAVE_DEFINITIONS[this.state.wave].reward} bounty`, '#f5c44d')
    this.updateHud()
  }

  private removeEnemy(enemy: RuntimeEnemy): void {
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy)
    this.destroyEnemy(enemy)
  }

  private destroyEnemy(enemy: RuntimeEnemy): void {
    enemy.aura.destroy()
    enemy.body.destroy()
    enemy.healthBack.destroy()
    enemy.healthBar.destroy()
    enemy.indicator.destroy()
  }

  private finishWave(): void {
    this.state = completeWave(this.state, this.waveBounty)
    this.waveBounty = 0
    this.showStatus(this.state.phase === 'ended' ? 'All five waves cleared.' : 'Wave clear. Spend or save your bounty.', '#f5c44d')
    this.render()
  }

  private upgradeChance(): void {
    const upgraded = buyGemChance(this.state)
    if (upgraded === this.state) {
      this.showStatus('Not enough bounty for that upgrade.', '#e9573f')
      return
    }
    this.state = upgraded
    this.showStatus('Future gems now have better quality odds.', '#f5c44d')
    this.render()
  }

  private combinePrism(): void {
    this.state = craftPrism(this.state)
    this.showStatus('Prism forged: focused damage with exceptional reach.', '#f2a7d7')
    this.render()
  }

  private combineSlate(): void {
    this.state = craftSlate(this.state)
    this.showStatus('Slate crafted. Tap it, then tap a new path cell to move it.', '#d6aee8')
    this.render()
  }

  private nextBuild(): void {
    this.state = beginNextPlacement(this.state)
    this.render()
    this.showStatus('Place five new gems.', '#f4efe6')
  }

  private togglePause(): void {
    this.paused = !this.paused
    this.render()
    this.showStatus(this.paused ? 'Wave paused.' : 'Wave resumed.', '#f4efe6')
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1
    this.render()
    this.showStatus(`Wave speed ${this.speed}x.`, '#f4efe6')
  }

  private restart(): void {
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy))
    this.enemies = []
    this.state = createInitialState()
    this.random = new SeededRandom(this.seed)
    this.selectedGemId = undefined
    this.movingSlateId = undefined
    this.movingCandidateId = undefined
    this.paused = false
    this.speed = 1
    this.render()
    this.showStatus('New run. Place your first gem.', '#f4efe6')
  }

  private updateHud(): void {
    const shownWave = Math.min(this.state.wave + (this.state.phase === 'wave' ? 1 : 0), 5)
    this.waveText?.setText(`WAVE  ${shownWave} / 5`)
    this.resourceText?.setText(`LIVES  ${this.state.lives}   BOUNTY  ${this.state.bounty + this.waveBounty}`)
  }

  private showStatus(message: string, color: string): void {
    const announcer = document.querySelector<HTMLElement>('#game-announcer')
    if (announcer) announcer.textContent = message
    if (!this.statusText) return
    this.statusText.setText(message).setColor(color).setAlpha(1)
    this.tweens.killTweensOf(this.statusText)
    this.tweens.add({ targets: this.statusText, alpha: 0.35, delay: 1200, duration: 300 })
  }

  private positionEnemy(enemy: RuntimeEnemy): void {
    if (enemy.distance < 0 || enemy.distance >= this.route.length - 1) return
    const routeIndex = Math.floor(enemy.distance)
    const progress = enemy.distance - routeIndex
    const from = this.cellCenter(this.route[routeIndex])
    const to = this.cellCenter(this.route[routeIndex + 1])
    const x = Phaser.Math.Linear(from.x, to.x, progress)
    const y = Phaser.Math.Linear(from.y, to.y, progress)
    const scale = Phaser.Math.Clamp(this.zoom * 1.8, 0.75, 1.8)
    enemy.aura.setPosition(x, y).setScale(scale)
    enemy.body.setPosition(x, y).setScale(scale)
    enemy.healthBack
      .setPosition(x - 12 * scale, y - 15 * scale)
      .setDisplaySize(24 * scale, Math.max(3, 4 * scale))
    enemy.healthBar
      .setPosition(x - 10 * scale, y - 15 * scale)
      .setDisplaySize(20 * scale * (enemy.health / enemy.maxHealth), Math.max(2, 2 * scale))
    this.positionEnemyIndicator(enemy, x, y)
  }

  private positionEnemyIndicator(enemy: RuntimeEnemy, x: number, y: number): void {
    const inset = 12
    const left = VIEW_X + inset
    const right = VIEW_X + VIEW_WIDTH - inset
    const top = VIEW_Y + inset
    const bottom = VIEW_Y + VIEW_HEIGHT - inset
    const enemyRadius = enemy.aura.displayWidth / 2
    if (
      x + enemyRadius >= VIEW_X &&
      x - enemyRadius <= VIEW_X + VIEW_WIDTH &&
      y + enemyRadius >= VIEW_Y &&
      y - enemyRadius <= VIEW_Y + VIEW_HEIGHT
    ) {
      enemy.indicator.setAlpha(0)
      return
    }

    const centerX = VIEW_X + VIEW_WIDTH / 2
    const centerY = VIEW_Y + VIEW_HEIGHT / 2
    const directionX = x - centerX
    const directionY = y - centerY
    const edgeScale = Math.min(
      directionX === 0 ? Number.POSITIVE_INFINITY : (directionX > 0 ? right - centerX : left - centerX) / directionX,
      directionY === 0 ? Number.POSITIVE_INFINITY : (directionY > 0 ? bottom - centerY : top - centerY) / directionY,
    )
    enemy.indicator
      .setPosition(centerX + directionX * edgeScale, centerY + directionY * edgeScale)
      .setRotation(Math.atan2(directionY, directionX) + Math.PI / 2)
      .setAlpha(0.9)
  }

  private worldToScreen(x: number, y: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      VIEW_X + (x - this.panX) * this.zoom,
      VIEW_Y + (y - this.panY) * this.zoom,
    )
  }

  private cellCenter(cell: Cell): Phaser.Math.Vector2 {
    return this.worldToScreen(
      cell.col * CELL_SIZE + CELL_SIZE / 2,
      cell.row * CELL_SIZE + CELL_SIZE / 2,
    )
  }

  private readSeed(): number {
    const requested = Number(new URLSearchParams(window.location.search).get('seed'))
    return Number.isFinite(requested) && requested > 0 ? requested : Date.now()
  }

  private hudStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color: '#aaa49b',
      fontFamily: 'DM Sans, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }
  }
}

const startScreen = document.querySelector<HTMLElement>('#game-start')
const startButton = document.querySelector<HTMLButtonElement>('#game-start-button')

startButton?.addEventListener('click', () => {
  startScreen?.remove()
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#171716',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    scene: GemTdScene,
  })
})
