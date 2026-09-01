import Phaser from 'phaser'
import './games.scss'

class BombDodgerScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Arc
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>

  constructor() {
    super('BombDodger')
  }

  create(): void {
    const { width, height } = this.scale

    this.add.rectangle(width / 2, height / 2, width, height, 0x171716)
    this.add.grid(width / 2, height / 2, width, height, 48, 48, 0x171716, 1, 0x343430, 0.45)

    this.add
      .text(width / 2, height / 2 - 44, 'BOMB DODGER', {
        color: '#f4efe6',
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '36px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.add
      .text(width / 2, height / 2 + 4, 'Phaser scene ready for gameplay', {
        color: '#aaa49b',
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '16px',
      })
      .setOrigin(0.5)

    this.player = this.add.circle(width / 2, height - 72, 15, 0xe9573f)
    this.physics.add.existing(this.player)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setCollideWorldBounds(true)

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys()
      this.wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<
        'up' | 'down' | 'left' | 'right',
        Phaser.Input.Keyboard.Key
      >
    }
  }

  update(): void {
    if (!this.player?.body) return

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    const speed = 240
    const left = this.cursors?.left.isDown || this.wasd?.left.isDown
    const right = this.cursors?.right.isDown || this.wasd?.right.isDown
    const up = this.cursors?.up.isDown || this.wasd?.up.isDown
    const down = this.cursors?.down.isDown || this.wasd?.down.isDown

    playerBody.setVelocity(
      left ? -speed : right ? speed : 0,
      up ? -speed : down ? speed : 0,
    )
    playerBody.velocity.normalize().scale(speed)
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#171716',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: BombDodgerScene,
})