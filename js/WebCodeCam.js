/*!
 * jQuery Plugin WebCodeCam-1.0.0
 * Author: Tóth András
 * Web: http://atandrastoth.co.uk
 * email: atandrastoth@gmail.com
 * Licensed under the MIT license
 */
/*
Included:
barcode decoder (DecoderWorker.js) -> https://github.com/EddieLa/BarcodeReader/blob/master/src/DecoderWorker.js
qr-decoder (qrcodelib.js) -> https://github.com/LazarSoft/jsqrcode
*/
;
(function($, window, document, undefined) {
	'use strict';
	var Self, lastImageSrc, con, display, w, h,
		streams = {},
		camera = $('<video style="position:absolute;visibility:hidden;display: none;">')[0],
		flipped = false,
		isStreaming = false,
		DecodeWorker = new Worker("js/DecoderWorker.js"),
		delay = false,
		pluginName = "WebCodeCam",
		defaults = {
			ReadQRCode: true,
			ReadBarecode: true,
			width: 320,
			height: 240,
			videoSource: {
				id: true,
				maxWidth: 640,
				maxHeight: 480
			},
			flipVertical: false,
			flipHorizontal: false,
			zoom: -1,
			beep: "js/beep.mp3",
			brightness: 0,
			autoBrightnessValue: false,
			grayScale: false,
			contrast: 0,
			threshold: 0,
			sharpness: [],
			resultFunction: function(resText, lastImageSrc) {},
			getUserMediaError: function() {},
			cameraError: function(error) {}
		};

	function Plugin(element, options) {
		this.element = element;
		display = $(element);
		this.options = $.extend({}, defaults, options);
		this._defaults = defaults;
		this._name = pluginName;
		if (this.init()) {
			this.setEventListeners();
			if (this.options.ReadQRCode || this.options.ReadBarecode) {
				this.setCallback();
			};
		}
	}
	Plugin.prototype = {
		init: function() {
			Self = this;
			con = Self.element.getContext('2d');
			w = Self.options.width;
			h = Self.options.height;
			navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
			if (navigator.getUserMedia) {
				if (!streams[Self.options.videoSource.id] || !streams[Self.options.videoSource.id].active) {
					navigator.getUserMedia({
						video: {
							mandatory: {
								maxWidth: Self.options.videoSource.maxWidth,
								maxHeight: Self.options.videoSource.maxHeight
							},
							optional: [{
								sourceId: Self.options.videoSource.id
							}]
						},
						audio: false
					}, Self.cameraSuccess, Self.cameraError);
				} else {
					Self.cameraSuccess(streams[Self.options.videoSource.id]);
				}
			} else {
				Self.options.getUserMediaError();
				return false;
			}
			return true;
		},
		cameraSuccess: function(stream) {
			streams[Self.options.videoSource.id] = stream;
			var url = window.URL || window.webkitURL;
			camera.src = url ? url.createObjectURL(stream) : stream;
			camera.play();
		},
		cameraError: function(error) {
			Self.options.cameraError(error);
			return false;
		},
		setEventListeners: function() {
			camera.addEventListener('canplay', function(e) {
				if (!isStreaming) {
					if (camera.videoWidth > 0) h = camera.videoHeight / (camera.videoWidth / w);
					display[0].setAttribute('width', w);
					display[0].setAttribute('height', h);
					if (Self.options.flipHorizontal) {
						con.scale(-1, 1);
						con.translate(-w, 0);
					}
					if (Self.options.flipVertical) {
						con.scale(1, -1);
						con.translate(0, -h);
					}
					isStreaming = true;
					if (Self.options.ReadQRCode || Self.options.ReadBarecode) {
						Self.delay();
					}
				}
			}, false);
			camera.addEventListener('play', function() {
				setInterval(function() {
					if (camera.paused || camera.ended) return;
					con.clearRect(0, 0, w, h);
					var z = Self.options.zoom;
					if (z < 0) {
						z = Self.optimalZoom();
					}
					con.drawImage(camera, (w * z - w) / -2, (h * z - h) / -2, w * z, h * z);
					var imageData = con.getImageData(0, 0, w, h);
					if (Self.options.grayScale) {
						imageData = Self.grayScale(imageData);
					}
					if (Self.options.brightness != 0 || Self.options.autoBrightnessValue != false) {
						imageData = Self.brightness(imageData, Self.options.brightness);
					}
					if (Self.options.contrast != 0) {
						imageData = Self.contrast(imageData, Self.options.contrast);
					}
					if (Self.options.threshold != 0) {
						imageData = Self.threshold(imageData, Self.options.threshold);
					}
					if (Self.options.sharpness.length != 0) {
						imageData = Self.convolute(imageData, Self.options.sharpness);
					}
					con.putImageData(imageData, 0, 0);
				}, 40);
			}, false);
		},
		setCallback: function() {
			DecodeWorker.onmessage = function(e) {
				if (delay || camera.paused) return;
				if (e.data.success && e.data.result[0].length > 1 && e.data.result[0].indexOf("undefined") == -1) {
					Self.beep();
					delay = true;
					Self.delay();
					Self.options.resultFunction(e.data.result[0], lastImageSrc);
				} else if (e.data.finished) {
					flipped = !flipped;
					setTimeout(function() {
						Self.tryParseBarecode();
					}, 40 * 8);
				}
			}
			qrcode.callback = function(a) {
				if (delay || camera.paused) return;
				Self.beep();
				delay = true;
				Self.delay();
				Self.options.resultFunction(a, lastImageSrc);
			};
		},
		tryParseBarecode: function() {
			var flipMode = flipped == true ? "flip" : "normal";
			lastImageSrc = display[0].toDataURL();
			var dst = con.getImageData(0, 0, w, h).data;
			DecodeWorker.postMessage({
				ImageData: dst,
				Width: w,
				Height: h,
				cmd: flipMode,
				DecodeNr: 1,
				LowLight: false
			});
		},
		tryParseQRCode: function() {
			try {
				lastImageSrc = display[0].toDataURL();
				qrcode.decode();
			} catch (e) {
				if (!delay) {
					setTimeout(function() {
						Self.tryParseQRCode();
					}, 40 * 8);
				}
			};
		},
		delay: function() {
			Self.cameraPlay(true);
		},
		cameraStop: function() {
			delay = true;
			camera.pause();
		},
		cameraStopAll: function() {
			con.clearRect(0, 0, w, h);
			delay = true;
			camera.pause();
			for (var st in streams) {
				if (streams[st]) {
					streams[st].stop();
					streams[st] = null;
				}
			}
		},
		cameraPlay: function(skip) {
			if (!streams[Self.options.videoSource.id]) {
				Self.init();
			} else if (!skip) {
				Self.cameraSuccess(streams[Self.options.videoSource.id]);
			}
			delay = true;
			camera.play();
			setTimeout(function() {
				delay = false;
				if (Self.options.ReadBarecode) Self.tryParseBarecode();
				if (Self.options.ReadQRCode) Self.tryParseQRCode();
			}, 2000);
		},
		getLastImageSrc: function() {
			return lastImageSrc;
		},
		optimalZoom: function(zoom) {
			return camera.videoHeight / h;
		},
		getImageLightness: function() {
			var pixels = con.getImageData(0, 0, w, h),
				d = pixels.data,
				colorSum = 0,
				r, g, b, avg;
			for (var x = 0, len = d.length; x < len; x += 4) {
				r = d[x];
				g = d[x + 1];
				b = d[x + 2];
				avg = Math.floor((r + g + b) / 3);
				colorSum += avg;
			}
			return Math.floor(colorSum / (w * h));
		},
		brightness: function(pixels, adjustment) {
			adjustment = (adjustment == 0 && Self.options.autoBrightnessValue != false) ? Self.options.autoBrightnessValue - Self.getImageLightness() : adjustment;
			var d = pixels.data;
			for (var i = 0; i < d.length; i += 4) {
				d[i] += adjustment;
				d[i + 1] += adjustment;
				d[i + 2] += adjustment;
			}
			return pixels;
		},
		grayScale: function(pixels) {
			var d = pixels.data;
			for (var i = 0; i < d.length; i += 4) {
				var r = d[i],
					g = d[i + 1],
					b = d[i + 2],
					v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				d[i] = d[i + 1] = d[i + 2] = v
			}
			return pixels;
		},
		contrast: function(pixels, contrast) {
			var d = pixels.data;
			for (var i = 0; i < d.length; i += 4) {
				var contrast = 10,
					average = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3);
				if (average > 127) {
					d[i] += (d[i] / average) * contrast;
					d[i + 1] += (d[i + 1] / average) * contrast;
					d[i + 2] += (d[i + 2] / average) * contrast;
				} else {
					d[i] -= (d[i] / average) * contrast;
					d[i + 1] -= (d[i + 1] / average) * contrast;
					d[i + 2] -= (d[i + 2] / average) * contrast;
				}
			}
			return pixels;
		},
		threshold: function(pixels, threshold) {
			var average, d = pixels.data;
			for (var i = 0, len = w * h * 4; i < len; i += 4) {
				average = (d[i] + d[i + 1] + d[i + 2]);
				if (average < threshold) {
					d[i] = d[i + 1] = d[i + 2] = 0;
				} else {
					d[i] = d[i + 1] = d[i + 2] = 255;
				}
				d[i + 3] = 255;
			}
			return pixels;
		},
		convolute: function(pixels, weights, opaque) {
			var sw = pixels.width,
				sh = pixels.height,
				w = sw,
				h = sh,
				side = Math.round(Math.sqrt(weights.length)),
				halfSide = Math.floor(side / 2),
				src = pixels.data,
				tmpCanvas = document.createElement('canvas'),
				tmpCtx = tmpCanvas.getContext('2d'),
				output = tmpCtx.createImageData(w, h),
				dst = output.data,
				alphaFac = opaque ? 1 : 0;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var sy = y,
						sx = x,
						r = 0,
						g = 0,
						b = 0,
						a = 0,
						dstOff = (y * w + x) * 4;
					for (var cy = 0; cy < side; cy++) {
						for (var cx = 0; cx < side; cx++) {
							var scy = sy + cy - halfSide,
								scx = sx + cx - halfSide;
							if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
								var srcOff = (scy * sw + scx) * 4,
									wt = weights[cy * side + cx];
								r += src[srcOff] * wt;
								g += src[srcOff + 1] * wt;
								b += src[srcOff + 2] * wt;
								a += src[srcOff + 3] * wt;
							}
						}
					}
					dst[dstOff] = r;
					dst[dstOff + 1] = g;
					dst[dstOff + 2] = b;
					dst[dstOff + 3] = a + alphaFac * (255 - a);
				}
			}
			return output;
		},
		beep: function() {
			if (typeof Self.options.beep != 'string') return;
			var url = Self.options.beep;
			setTimeout(function() {
				new Audio(url).play();
			}, 0);
		}
	};
	$.fn[pluginName] = function(options) {
		return this.each(function() {
			if (!$.data(this, "plugin_" + pluginName)) {
				$.data(this, "plugin_" + pluginName, new Plugin(this, options));
			}
		});
	};
})(jQuery, window, document);