import * as Phaser from 'phaser';
import { VIEW } from '../sim/constants.js';
import { GameScene } from './scenes/GameScene.js';
export const gameConfig = {
    // WEBGL for preFX glow; mipmaps stop thin legs shimmering (power-of-two textures only, so 384px buildings stay LINEAR).
    type: Phaser.WEBGL,
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
    parent: 'game',
    backgroundColor: '#0A0D14',
    width: VIEW.width,
    height: VIEW.height,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [GameScene],
};
