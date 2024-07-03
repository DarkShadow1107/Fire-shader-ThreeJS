import * as THREE from "https://esm.sh/three@0.156.1";
import { OrbitControls } from "https://esm.sh/three@0.156.1/addons/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.156.1/examples/jsm/loaders/GLTFLoader";

import { EffectComposer } from "https://esm.sh/three@0.156.1/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.156.1/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://esm.sh/three@0.156.1/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://esm.sh/three@0.156.1/addons/postprocessing/OutputPass.js";

import GUI from "https://esm.sh/lil-gui";

document.addEventListener("DOMContentLoaded", () => new App());

class App {
	constructor() {
		this.winWidth = window.innerWidth;
		this.winHeight = window.innerHeight;
		this.gltfFile = "https://assets.codepen.io/264161/fireplace9.glb";
		this.noiseFile = "https://assets.codepen.io/264161/noise_1.jpg";
		this.loadAssets();
	}

	loadModel() {
		const loaderModel = new GLTFLoader();
		return new Promise((resolve) => {
			loaderModel.load(this.gltfFile, (gltf) => {
				resolve(gltf.scene);
			});
		});
	}

	loadNoise() {
		const textureLoader = new THREE.TextureLoader();
		return new Promise((resolve) => {
			textureLoader.load(this.noiseFile, (texture) => {
				texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
				resolve(texture);
			});
		});
	}

	async loadAssets() {
		this.model = await this.loadModel();
		this.noiseTexture = await this.loadNoise();
		this.initApp();
	}

	initApp() {
		// Clock
		this.clock = new THREE.Clock();
		this.time = 0;
		this.deltaTime = 0;

		this.fireSpeed = 1;
		this.stylize = false;

		this.rgbLightmapFrag = document.getElementById("rgbLightmapFrag").textContent;
		this.basicVert = document.getElementById("basicVert").textContent;
		this.fireVert = document.getElementById("fireVert").textContent;
		this.fireFrag = document.getElementById("fireFrag").textContent;
		this.ashesFrag = document.getElementById("ashesFrag").textContent;

		this.createScene();
		this.createFireplace();
		this.createFire();
		this.createAshes();
		this.createRenderer();
		this.createControls();
		this.createListeners();
		this.createPostProcessing();
		this.createGUI();
		this.draw();
		this.onWindowResize();
	}

	createScene() {
		this.scene = new THREE.Scene();
		this.bgrColor = 0x000000;
		this.camera = new THREE.PerspectiveCamera(60, this.winWidth / this.winHeight, 0.1, 10);

		this.camera.position.set(0, 0.5, 1.5);
		this.scene.add(this.camera);
	}

	createFireplace() {
		// fireplace
		this.fireplace = this.model.getObjectByName("fireplace");
		const fireplaceMap = this.fireplace.material.map;
		this.fireplaceMat = new THREE.ShaderMaterial({
			uniforms: {
				map: { value: fireplaceMap },
				ratioR: { value: 0.0 },
				ratioG: { value: 1.0 },
				ratioB: { value: 0.0 },
				gamma: { value: 1 },
			},

			vertexShader: this.basicVert,
			fragmentShader: this.rgbLightmapFrag,
		});

		this.fireplace.material = this.fireplaceMat;

		// floor
		this.floor = this.model.getObjectByName("floor");
		const floorMap = this.floor.material.map;
		this.floorMat = this.fireplaceMat.clone();
		this.floorMat.uniforms.map.value = floorMap;
		this.floor.material = this.floorMat;

		this.scene.add(this.fireplace);
		this.scene.add(this.floor);
	}

	createFire() {
		this.fireMat = new THREE.ShaderMaterial({
			uniforms: {
				noiseMap: { value: this.noiseTexture },
				time: { value: 0 },
				opacity: { value: 1 },
				intensity: { value: 1 },
				stylizeRatio: { value: 0.5 },
				stylizeThreshold: { value: 0.5 },
				grayscale: { type: "b", value: false },
				details: { value: 0.5 },
			},

			side: THREE.DoubleSide,
			transparent: false,
			blending: THREE.AdditiveBlending,
			vertexShader: this.fireVert,
			fragmentShader: this.fireFrag,
		});

		this.fireGeom = new THREE.CylinderGeometry(0.03, 0.2, 0.35, 15, 15, true, -Math.PI / 2, Math.PI);

		this.fireGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.1, 0));
		this.fire = new THREE.Mesh(this.fireGeom, this.fireMat);
		this.fire.position.set(0.1, -0.1, 0);
		this.fire.rotation.y = -Math.PI / 2;
		this.fireplace.add(this.fire);
	}

	createAshes() {
		this.ashesMat = new THREE.ShaderMaterial({
			uniforms: {
				noiseMap: { value: this.noiseTexture },
				intensity: { value: 1 },
				time: { value: 0 },
			},

			side: THREE.DoubleSide,
			transparent: false,
			blending: THREE.MultiplyBlending,
			vertexShader: this.fireVert,
			fragmentShader: this.ashesFrag,
		});

		this.ashesGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 15, 15, true, -Math.PI / 2, Math.PI);

		this.ashes = new THREE.Mesh(this.ashesGeom, this.ashesMat);
		this.ashes.position.set(0.1, 0.1, 0);
		this.ashes.rotation.y = -Math.PI / 2;
		this.fireplace.add(this.ashes);
	}

	createRenderer() {
		const canvas = document.querySelector("canvas.webgl");
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			preserveDrawingBuffer: true,
		});

		this.renderer.setPixelRatio((this.pixelRatio = window.devicePixelRatio));
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.toneMapping = THREE.LinearToneMapping;
		this.renderer.toneMappingExposure = 1;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		this.renderer.localClippingEnabled = true;
	}

	createControls() {
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.minDistance = 0;
		this.controls.maxDistance = 20;
		this.controls.enabled = true;
		this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
		this.controls.target = new THREE.Vector3(0, 0.3, 0);
	}

	createListeners() {
		window.addEventListener("resize", this.onWindowResize.bind(this));
	}
	createGUI() {
		this.gui = new GUI();
		this.gui.add(this, "fireSpeed", 0.1, 3).name("Speed");
		this.gui.add(this.fireMat.uniforms.opacity, "value", 0, 1).name("Opacity");

		this.gui.add(this.fireMat.uniforms.intensity, "value", 0.5, 1.5).name("Intensity");

		this.gui.add(this.fireMat.uniforms.details, "value", 0, 2).name("Details");

		this.gui.add(this.fireMat.uniforms.stylizeRatio, "value", 0, 1).name("Stylize Ratio");

		this.gui.add(this.fireMat.uniforms.stylizeThreshold, "value", 0, 1).name("Stylise Threshold");

		this.gui.add(this.fireMat.uniforms.grayscale, "value").name("Grayscale");

		this.gui.add(this.bloomPass, "strength", 0, 2).name("bloom");

		//this.gui.close();
	}

	createPostProcessing() {
		this.renderScene = new RenderPass(this.scene, this.camera);
		this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.25, 0.1, 0.8);

		this.outputPass = new OutputPass();

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(this.renderScene);
		this.composer.addPass(this.bloomPass);
		this.composer.addPass(this.outputPass);
	}

	draw() {
		this.deltaTime = this.clock.getDelta();
		this.time += this.deltaTime;
		this.composer.render();
		this.controls.update();
		this.updateFire();
		this.updateLight();
		window.requestAnimationFrame(this.draw.bind(this));
	}

	updateFire() {
		this.fireMat.uniforms.time.value = this.time * this.fireSpeed;
		this.ashesMat.uniforms.time.value = this.time * this.fireSpeed;
	}

	updateLight() {
		const r = Math.abs(Math.sin(this.time) + Math.cos(this.time * 4 + 0.1) * 0.5) * 0.2;
		const g = Math.abs(Math.sin(this.time + Math.PI / 2) + Math.cos(this.time * 4 + 1.4) * 0.5) * 0.2;
		const b = Math.abs(Math.sin(this.time + Math.PI)) * 0.2;

		this.floorMat.uniforms.ratioR.value = 0.1 + r * 3;
		this.floorMat.uniforms.ratioG.value = 0.1 + g * 3;
		this.floorMat.uniforms.ratioB.value = 0.1 + b * 3;

		this.fireplaceMat.uniforms.ratioR.value = 0.0 + r * 1.5;
		this.fireplaceMat.uniforms.ratioG.value = 0.0 + g * 1.5;
		this.fireplaceMat.uniforms.ratioB.value = 0.0 + b * 1.5;
	}

	onWindowResize() {
		this.winWidth = window.innerWidth;
		this.winHeight = window.innerHeight;
		this.renderer.setSize(this.winWidth, this.winHeight);
		this.composer.setSize(this.winWidth, this.winHeight);
		this.camera.aspect = this.winWidth / this.winHeight;
		this.camera.updateProjectionMatrix();

		if (this.gui) {
			if (this.winWidth < 600) this.gui.close();
			else this.gui.open();
		}
	}
}
