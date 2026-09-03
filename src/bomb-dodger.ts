import Phaser from 'phaser'
import './games.scss'

const GAME_WIDTH = 960
const GAME_HEIGHT = 540
const GROUND_Y = 486
const BOMB_RADIUS = 15
const BLAST_RADIUS = 108
const TILT_DEAD_ZONE = 3
const MAX_TILT = 24

type DeviceOrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

let tiltPermissionGranted = false

class BombDodgerScene extends Phaser.Scene {
  private bomb?: Phaser.GameObjects.Arc
  private target?: Phaser.GameObjects.Triangle
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'left' | 'right', Phaser.Input.Keyboard.Key>
  private scoreText?: Phaser.GameObjects.Text
  private livesText?: Phaser.GameObjects.Text
  private messageText?: Phaser.GameObjects.Text
  private tiltStatusText?: Phaser.GameObjects.Text
  private tilt = 0
  private tiltBaseline?: number
  private tiltEnabled = false
  private targetDirection = 1
  private nextDirectionChange = 0
  private score = 0
  private lives = 3
  private roundActive = false

  constructor() {
    super('BombDodger')
  }

  create(): void {
    const { width, height } = this.scale

    this.add.rectangle(width / 2, height / 2, width, height, 0x171716)
    this.add.grid(width / 2, height / 2, width, height, 48, 48, 0x171716, 1, 0x343430, 0.45)
    this.add.rectangle(width / 2, GROUND_Y + 27, width, 54, 0x20201f)
    this.add.rectangle(width / 2, GROUND_Y, width, 3, 0xf5c44d)

    this.scoreText = this.add.text(24, 20, 'HITS  0', this.hudStyle())
    this.livesText = this.add
      .text(width - 24, 20, 'BOMBS  3', this.hudStyle())
      .setOrigin(1, 0)
    this.messageText = this.add
      .text(width / 2, height / 2, '', {
        color: '#f4efe6',
        fontFamily: 'Archivo Black, sans-serif',
        fontSize: '30px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10)

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
      this.wasd = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<'left' | 'right', Phaser.Input.Keyboard.Key>
    }

    if (tiltPermissionGranted) this.enableTilt()
    this.startRound()
  }

  update(time: number): void {
    if (!this.roundActive || !this.bomb || !this.target) return

    const deltaSeconds = this.game.loop.delta / 1000
    const horizontalSpeed = 235
    const left = this.cursors?.left.isDown || this.wasd?.left.isDown
    const right = this.cursors?.right.isDown || this.wasd?.right.isDown
    const tiltStrength = Math.abs(this.tilt) < TILT_DEAD_ZONE
      ? 0
      : Phaser.Math.Clamp(this.tilt / MAX_TILT, -1, 1)
    const horizontalMovement = left
      ? -horizontalSpeed
      : right
        ? horizontalSpeed
        : tiltStrength * horizontalSpeed

    this.bomb.x = Phaser.Math.Clamp(
      this.bomb.x + horizontalMovement * deltaSeconds,
      BOMB_RADIUS,
      GAME_WIDTH - BOMB_RADIUS,
    )
    this.bomb.y += 132 * deltaSeconds
    this.bomb.rotation += 0.025

    if (time >= this.nextDirectionChange) {
      if (Math.random() < 0.58) this.targetDirection *= -1
      this.nextDirectionChange = time + Phaser.Math.Between(260, 720)
    }

    this.target.x += this.targetDirection * 290 * deltaSeconds
    if (this.target.x <= 24 || this.target.x >= GAME_WIDTH - 24) {
      this.target.x = Phaser.Math.Clamp(this.target.x, 24, GAME_WIDTH - 24)
      this.targetDirection *= -1
    }

    if (this.bomb.y + BOMB_RADIUS >= GROUND_Y) this.detonate()
  }

  private startRound(): void {
    this.messageText?.setText('')
    this.bomb?.destroy()
    this.target?.destroy()

    const bombX = Phaser.Math.Between(160, GAME_WIDTH - 160)
    this.bomb = this.add.circle(bombX, 66, BOMB_RADIUS, 0x2a2a28).setStrokeStyle(3, 0xf4efe6)
    this.target = this.add
      .triangle(Phaser.Math.Between(100, GAME_WIDTH - 100), GROUND_Y - 17, 0, 30, 22, 0, 44, 30, 0xe9573f)
      .setOrigin(0.5, 1)
    this.targetDirection = Math.random() < 0.5 ? -1 : 1
    this.nextDirectionChange = this.time.now + Phaser.Math.Between(350, 650)
    this.roundActive = true
  }

  private detonate(): void {
    if (!this.bomb || !this.target) return
    this.roundActive = false

    const blastX = this.bomb.x
    const hit = Math.abs(blastX - this.target.x) <= BLAST_RADIUS + 15
    this.bomb.destroy()
    this.bomb = undefined

    const blast = this.add.circle(blastX, GROUND_Y, 8, 0xf5c44d, 0.9).setDepth(5)
    const shockwave = this.add
      .circle(blastX, GROUND_Y, 8, 0xe9573f, 0)
      .setStrokeStyle(6, 0xe9573f, 0.9)
      .setDepth(4)

    this.tweens.add({
      targets: [blast, shockwave],
      scale: BLAST_RADIUS / 8,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => {
        blast.destroy()
        shockwave.destroy()
      },
    })

    if (hit) {
      this.score += 1
      this.scoreText?.setText(`HITS  ${this.score}`)
      this.tweens.add({
        targets: this.target,
        scale: 2.4,
        alpha: 0,
        angle: 180,
        duration: 220,
      })
      this.showResult('DIRECT HIT', '#f5c44d')
    } else {
      this.lives -= 1
      this.livesText?.setText(`BOMBS  ${this.lives}`)
      this.showResult(this.lives > 0 ? 'MISSED' : 'RUN OVER', '#f4efe6')
    }

    this.time.delayedCall(850, () => {
      if (this.lives > 0) {
        this.startRound()
      } else {
        this.input.keyboard?.once('keydown-SPACE', () => this.restartGame())
        this.input.once('pointerdown', () => this.restartGame())
        this.messageText
          ?.setText(`RUN OVER\n${this.score} HITS\n\nSPACE OR TAP TO RETRY`)
          .setFontSize(24)
          .setAlpha(1)
      }
    })
  }

  private showResult(message: string, color: string): void {
    this.messageText?.setText(message).setColor(color).setAlpha(1)
    this.tweens.add({
      targets: this.messageText,
      alpha: 0,
      delay: 400,
      duration: 260,
    })
  }

  private restartGame(): void {
    this.score = 0
    this.lives = 3
    this.scoreText?.setText('HITS  0')
    this.livesText?.setText('BOMBS  3')
    this.messageText?.setFontSize(30).setAlpha(1)
    this.startRound()
  }

  private enableTilt(): void {
    if (this.tiltEnabled) return
    this.tiltEnabled = true
    this.tiltStatusText = this.add
      .text(GAME_WIDTH / 2, 20, 'TILT READY', this.hudStyle())
      .setOrigin(0.5, 0)
    window.addEventListener('deviceorientation', this.handleOrientation)
    window.addEventListener('orientationchange', this.resetTiltCalibration)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('deviceorientation', this.handleOrientation)
      window.removeEventListener('orientationchange', this.resetTiltCalibration)
    })
  }

  private handleOrientation = (event: DeviceOrientationEvent): void => {
    const legacyAngle = (window as Window & { orientation?: number }).orientation
    const angle = ((screen.orientation?.angle ?? legacyAngle ?? 0) + 360) % 360
    const reading = angle === 90
      ? event.beta
      : angle === 270
        ? event.beta === null ? null : -event.beta
        : event.gamma

    if (reading === null) return
    this.tiltBaseline ??= reading
    this.tilt = reading - this.tiltBaseline
    this.tiltStatusText?.setText('TILT ACTIVE').setColor('#f5c44d')
  }

  private resetTiltCalibration = (): void => {
    this.tilt = 0
    this.tiltBaseline = undefined
    this.tiltStatusText?.setText('TILT READY').setColor('#aaa49b')
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
const startStatus = document.querySelector<HTMLElement>('#game-start-status')

const launchGame = (): void => {
  startScreen?.remove()
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#171716',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    scene: BombDodgerScene,
  })
}

startButton?.addEventListener('click', async () => {
  if (startButton.dataset.fallback === 'true' || navigator.maxTouchPoints === 0) {
    launchGame()
    return
  }

  startButton.disabled = true
  if (startStatus) startStatus.textContent = 'Requesting motion access...'

  let failureMessage = ''
  if (!window.isSecureContext) {
    failureMessage = 'Tilt requires HTTPS on iOS. Open this page from a secure URL.'
  } else if (!('DeviceOrientationEvent' in window)) {
    failureMessage = 'This browser does not provide device orientation.'
  } else {
    const orientationEvent = window.DeviceOrientationEvent as DeviceOrientationPermission
    try {
      tiltPermissionGranted = orientationEvent.requestPermission
        ? await orientationEvent.requestPermission() === 'granted'
        : true
      if (!tiltPermissionGranted) failureMessage = 'Motion access was denied in Safari.'
    } catch (error) {
      failureMessage = error instanceof Error
        ? `Motion access failed: ${error.message}`
        : 'Motion access failed in Safari.'
    }
  }

  if (tiltPermissionGranted) {
    launchGame()
    return
  }

  if (startStatus) startStatus.textContent = `${failureMessage} You can continue without tilt.`
  startButton.textContent = 'Play without tilt'
  startButton.dataset.fallback = 'true'
  startButton.disabled = false
})