/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { RGBA8 } from 'vs/editor/common/core/rgba';
import { ColorId, TokenizationRegistry } from 'vs/editor/common/modes';

export class MinimapTokensColorTracker {
	private static _INSTANCE: MinimapTokensColorTracker | null = null;
	public static getInstance(): MinimapTokensColorTracker {
		if (!this._INSTANCE) {
			this._INSTANCE = new MinimapTokensColorTracker();
		}
		return this._INSTANCE;
	}

	private _colors!: RGBA8[];
	private _backgroundIsLight!: boolean;

	private readonly _onDidChange = new Emitter<void>();
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	private constructor() {
		this._updateColorMap();
		TokenizationRegistry.onDidChange(e => {
			if (e.changedColorMap) {
				this._updateColorMap();
			}
		});
	}

	private _updateColorMap(): void {
		const colorMap = TokenizationRegistry.getColorMap();
		if (!colorMap) {
			this._colors = [RGBA8.Empty];
			this._backgroundIsLight = true;
			return;
		}
		this._colors = [RGBA8.Empty];
		for (let colorId = 1; colorId < colorMap.length; colorId++) {
			const source = colorMap[colorId].rgba;
			// Use a VM friendly data-type
			this._colors[colorId] = new RGBA8(source.r, source.g, source.b, Math.round(source.a * 255));
		}
		let backgroundLuminosity = colorMap[ColorId.DefaultBackground].getRelativeLuminance();
		this._backgroundIsLight = backgroundLuminosity >= 0.5;
		this._onDidChange.fire(undefined);
	}

	public getColor(colorId: ColorId): RGBA8 {
		if (colorId < 1 || colorId >= this._colors.length) {
			// background color (basically invisible)
			colorId = ColorId.DefaultBackground;
		}
		return this._colors[colorId];
	}

	public backgroundIsLight(): boolean {
		return this._backgroundIsLight;
	}
}

export const enum Constants {
	START_CH_CODE = 32, // Space
	END_CH_CODE = 126, // Tilde (~)
	CHAR_COUNT = END_CH_CODE - START_CH_CODE + 1,

	SAMPLED_CHAR_HEIGHT = 16,
	SAMPLED_CHAR_WIDTH = 10,
	SAMPLED_HALF_CHAR_WIDTH = SAMPLED_CHAR_WIDTH / 2,

	x2_CHAR_HEIGHT = 4,
	x2_CHAR_WIDTH = 2,

	x1_CHAR_HEIGHT = 2,
	x1_CHAR_WIDTH = 1,

	RGBA_CHANNELS_CNT = 4,
	RGBA_SAMPLED_ROW_WIDTH = RGBA_CHANNELS_CNT * CHAR_COUNT * SAMPLED_CHAR_WIDTH
}

export class MinimapCharRenderer {
	_minimapCharRendererBrand: void;

	private readonly charDataNormal: Uint8ClampedArray;
	private readonly charDataLight: Uint8ClampedArray;

	constructor(charData: Uint8ClampedArray, public readonly scale: number) {
		this.charDataNormal = MinimapCharRenderer.soften(charData, 12 / 15);
		this.charDataLight = MinimapCharRenderer.soften(charData, 50 / 60);
	}

	private static soften(input: Uint8ClampedArray, ratio: number): Uint8ClampedArray {
		let result = new Uint8ClampedArray(input.length);
		for (let i = 0, len = input.length; i < len; i++) {
			result[i] = input[i] * ratio;
		}
		return result;
	}

	private static _getChIndex(chCode: number): number {
		chCode -= Constants.START_CH_CODE;
		if (chCode < 0) {
			chCode += Constants.CHAR_COUNT;
		}
		return chCode % Constants.CHAR_COUNT;
	}

	public renderChar(
		target: ImageData,
		dx: number,
		dy: number,
		chCode: number,
		color: RGBA8,
		backgroundColor: RGBA8,
		useLighterFont: boolean
	): void {
		const charWidth = Constants.x1_CHAR_WIDTH * this.scale;
		const charHeight = Constants.x1_CHAR_HEIGHT * this.scale;
		if (dx + charWidth > target.width || dy + charHeight > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const charData = useLighterFont ? this.charDataLight : this.charDataNormal;
		const charIndex = MinimapCharRenderer._getChIndex(chCode);

		const destWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const dest = target.data;
		let sourceOffset = charIndex * charWidth * charHeight;

		let row = dy * destWidth + dx * Constants.RGBA_CHANNELS_CNT;
		for (let y = 0; y < charHeight; y++) {
			let column = row;
			for (let x = 0; x < charWidth; x++) {
				const c = charData[sourceOffset++] / 255;
				dest[column++] = backgroundR + deltaR * c;
				dest[column++] = backgroundG + deltaG * c;
				dest[column++] = backgroundB + deltaB * c;
				column++;
			}

			row += destWidth;
		}
	}

	public blockRenderChar(
		target: ImageData,
		dx: number,
		dy: number,
		color: RGBA8,
		backgroundColor: RGBA8,
		useLighterFont: boolean
	): void {
		const charWidth = Constants.x1_CHAR_WIDTH * this.scale;
		const charHeight = Constants.x1_CHAR_HEIGHT * this.scale;
		if (dx + charWidth > target.width || dy + charHeight > target.height) {
			console.warn('bad render request outside image data');
			return;
		}

		const destWidth = target.width * Constants.RGBA_CHANNELS_CNT;

		const c = 0.5;

		const backgroundR = backgroundColor.r;
		const backgroundG = backgroundColor.g;
		const backgroundB = backgroundColor.b;

		const deltaR = color.r - backgroundR;
		const deltaG = color.g - backgroundG;
		const deltaB = color.b - backgroundB;

		const colorR = backgroundR + deltaR * c;
		const colorG = backgroundG + deltaG * c;
		const colorB = backgroundB + deltaB * c;

		const dest = target.data;

		let row = dy * destWidth + dx * Constants.RGBA_CHANNELS_CNT;
		for (let y = 0; y < charHeight; y++) {
			let column = row;
			for (let x = 0; x < charWidth; x++) {
				dest[column++] = colorR;
				dest[column++] = colorG;
				dest[column++] = colorB;
				column++;
			}

			row += destWidth;
		}
	}
}
